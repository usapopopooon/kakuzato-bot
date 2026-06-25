import { escapeMarkdown, type Guild, type GuildMember, type VoiceState } from 'discord.js'
import type { AppLogger } from '../../../platform/logger/logger'
import type {
  VoiceNotifyCategoryConfig,
  VoiceNotifyConfig,
  VoiceNotifyExclude,
  VoiceNotifyRepository
} from '../repositories/voiceNotifyRepository'

type VoiceNotifyEventType = 'join' | 'leave'

export type VoiceNotifySendableChannel = {
  id: string
  send(options: {
    content: string
    allowedMentions: { parse: ('everyone' | 'roles' | 'users')[] }
  }): Promise<unknown>
}

type VoiceNotifyVoiceChannel = {
  id: string
  parentId: string | null
}

export class VoiceNotifyService {
  private readonly repository: VoiceNotifyRepository
  private readonly logger: AppLogger

  constructor(repository: VoiceNotifyRepository, logger: AppLogger) {
    this.repository = repository
    this.logger = logger
  }

  async getConfig(guildId: string, voiceChannelId: string): Promise<VoiceNotifyConfig | undefined> {
    return this.repository.get(guildId, voiceChannelId)
  }

  async listConfigs(guildId: string): Promise<VoiceNotifyConfig[]> {
    return this.repository.listByGuild(guildId)
  }

  async listCategoryConfigs(guildId: string): Promise<VoiceNotifyCategoryConfig[]> {
    return this.repository.listCategoriesByGuild(guildId)
  }

  async listExcludes(guildId: string): Promise<VoiceNotifyExclude[]> {
    return this.repository.listExcludesByGuild(guildId)
  }

  async setConfig(
    guildId: string,
    voiceChannelId: string,
    notifyChannelId: string
  ): Promise<VoiceNotifyConfig> {
    return this.repository.set(guildId, voiceChannelId, notifyChannelId)
  }

  async setCategoryConfig(
    guildId: string,
    categoryId: string,
    notifyChannelId: string
  ): Promise<VoiceNotifyCategoryConfig> {
    return this.repository.setCategory(guildId, categoryId, notifyChannelId)
  }

  async deleteConfig(guildId: string, voiceChannelId: string): Promise<boolean> {
    return this.repository.delete(guildId, voiceChannelId)
  }

  async deleteCategoryConfig(guildId: string, categoryId: string): Promise<boolean> {
    return this.repository.deleteCategory(guildId, categoryId)
  }

  async addExclude(guildId: string, voiceChannelId: string): Promise<VoiceNotifyExclude> {
    return this.repository.setExclude(guildId, voiceChannelId)
  }

  async deleteExclude(guildId: string, voiceChannelId: string): Promise<boolean> {
    return this.repository.deleteExclude(guildId, voiceChannelId)
  }

  async deleteByGuild(guildId: string): Promise<number> {
    return this.repository.deleteByGuild(guildId)
  }

  async deleteByChannel(guildId: string, channelId: string): Promise<number> {
    return this.repository.deleteByChannel(guildId, channelId)
  }

  async handleVoiceStateUpdate(before: VoiceState, after: VoiceState): Promise<void> {
    if (before.channelId === after.channelId) {
      return
    }

    const member = after.member ?? before.member

    if (!member || member.user.bot) {
      return
    }

    if (before.channelId) {
      await this.sendVoiceNotification(after.guild, member, before.channelId, 'leave')
    }

    if (after.channelId) {
      await this.sendVoiceNotification(after.guild, member, after.channelId, 'join')
    }
  }

  private async sendVoiceNotification(
    guild: Guild,
    member: GuildMember,
    voiceChannelId: string,
    eventType: VoiceNotifyEventType
  ): Promise<boolean> {
    const voiceConfigs = await this.repository.listByVoiceChannel(guild.id, voiceChannelId)
    const categoryConfig = await this.findCategoryConfigForVoiceChannel(guild, voiceChannelId)
    const configsByNotifyChannel = new Map<string, VoiceNotifyConfig | VoiceNotifyCategoryConfig>()

    for (const config of voiceConfigs) {
      configsByNotifyChannel.set(config.notifyChannelId, config)
    }

    if (categoryConfig && !configsByNotifyChannel.has(categoryConfig.notifyChannelId)) {
      configsByNotifyChannel.set(categoryConfig.notifyChannelId, categoryConfig)
    }

    if (configsByNotifyChannel.size === 0) {
      return false
    }

    const content = createVoiceNotifyMessage(member, voiceChannelId, eventType)
    let sent = false

    for (const config of configsByNotifyChannel.values()) {
      const channel = await this.fetchSendableChannel(guild, config.notifyChannelId)

      if (!channel) {
        this.logger.warn(
          {
            guildId: guild.id,
            voiceChannelId,
            notifyChannelId: config.notifyChannelId
          },
          'Voice notify channel is not sendable'
        )
        continue
      }

      try {
        await channel.send({
          content,
          allowedMentions: { parse: [] }
        })
        sent = true
      } catch (error) {
        this.logger.warn(
          {
            error,
            guildId: guild.id,
            voiceChannelId,
            notifyChannelId: channel.id
          },
          'Failed to send voice notification'
        )
      }
    }

    return sent
  }

  private async findCategoryConfigForVoiceChannel(
    guild: Guild,
    voiceChannelId: string
  ): Promise<VoiceNotifyCategoryConfig | undefined> {
    const voiceChannel = await this.fetchVoiceChannel(guild, voiceChannelId)

    if (!voiceChannel?.parentId) {
      return undefined
    }

    if (await this.repository.isExcluded(guild.id, voiceChannelId)) {
      return undefined
    }

    return this.repository.getCategory(guild.id, voiceChannel.parentId)
  }

  private async fetchVoiceChannel(
    guild: Guild,
    channelId: string
  ): Promise<VoiceNotifyVoiceChannel | undefined> {
    const cached = guild.channels.cache.get(channelId)

    if (isVoiceNotifyVoiceChannel(cached)) {
      return cached
    }

    const fetched = await guild.channels.fetch(channelId).catch(() => null)

    if (isVoiceNotifyVoiceChannel(fetched)) {
      return fetched
    }

    return undefined
  }

  private async fetchSendableChannel(
    guild: Guild,
    channelId: string
  ): Promise<VoiceNotifySendableChannel | undefined> {
    const cached = guild.channels.cache.get(channelId)

    if (isVoiceNotifySendableChannel(cached)) {
      return cached
    }

    const fetched = await guild.channels.fetch(channelId).catch(() => null)

    if (isVoiceNotifySendableChannel(fetched)) {
      return fetched
    }

    return undefined
  }
}

export function createVoiceNotifyMessage(
  member: Pick<GuildMember, 'displayName'>,
  voiceChannelId: string,
  eventType: VoiceNotifyEventType
): string {
  const displayName = escapeMarkdown(member.displayName)

  if (eventType === 'join') {
    return `${displayName} さんが <#${voiceChannelId}> に入室しました。`
  }

  return `${displayName} さんが <#${voiceChannelId}> から退室しました。`
}

export function isVoiceNotifySendableChannel(
  channel: unknown
): channel is VoiceNotifySendableChannel {
  return (
    typeof channel === 'object' &&
    channel !== null &&
    'id' in channel &&
    typeof (channel as { id?: unknown }).id === 'string' &&
    'send' in channel &&
    typeof (channel as { send?: unknown }).send === 'function'
  )
}

function isVoiceNotifyVoiceChannel(channel: unknown): channel is VoiceNotifyVoiceChannel {
  if (
    typeof channel !== 'object' ||
    channel === null ||
    !('id' in channel) ||
    typeof (channel as { id?: unknown }).id !== 'string' ||
    !('parentId' in channel)
  ) {
    return false
  }

  const parentId = (channel as { parentId?: unknown }).parentId

  return typeof parentId === 'string' || parentId === null
}
