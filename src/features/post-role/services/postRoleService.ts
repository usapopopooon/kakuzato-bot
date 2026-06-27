import {
  ChannelType,
  type Client,
  type Guild,
  type Message,
  type NewsChannel,
  type TextChannel
} from 'discord.js'
import type { AppLogger } from '../../../platform/logger/logger'
import type { PostRoleConfig, PostRoleRepository } from '../repositories/postRoleRepository'

export const defaultPostRoleHistoryLimit = 500
export const minPostRoleHistoryLimit = 1
export const maxPostRoleHistoryLimit = 5_000

type PostRoleSetupInput = {
  guildId: string
  channelId: string
  roleId: string
  historyLimit?: number
}

export type PostRoleSyncResult = {
  configs: number
  scannedMessages: number
  uniqueUsers: number
  assigned: number
  alreadyHad: number
  skippedBots: number
  skippedMissingMembers: number
  failed: number
}

type RoleGrantResult =
  | 'assigned'
  | 'alreadyHad'
  | 'skippedBot'
  | 'skippedMissingMember'
  | 'failed'

type PostRoleHistoryChannel = TextChannel | NewsChannel

export class PostRoleService {
  private readonly repository: PostRoleRepository
  private readonly logger: AppLogger
  private configuredChannelIds?: Set<string>

  constructor(repository: PostRoleRepository, logger: AppLogger) {
    this.repository = repository
    this.logger = logger
  }

  async setConfig(input: PostRoleSetupInput): Promise<PostRoleConfig> {
    const config = await this.repository.set({
      guildId: input.guildId,
      channelId: input.channelId,
      roleId: input.roleId,
      historyLimit: normalizePostRoleHistoryLimit(input.historyLimit)
    })
    this.configuredChannelIds?.add(config.channelId)
    return config
  }

  async remove(channelId: string): Promise<boolean> {
    const deleted = await this.repository.delete(channelId)
    this.configuredChannelIds?.delete(channelId)
    return deleted
  }

  async listByGuild(guildId: string): Promise<PostRoleConfig[]> {
    return this.repository.listByGuild(guildId)
  }

  async deleteByGuild(guildId: string): Promise<number> {
    const configs = await this.repository.listByGuild(guildId)
    const deleted = await this.repository.deleteByGuild(guildId)

    if (this.configuredChannelIds) {
      for (const config of configs) {
        this.configuredChannelIds.delete(config.channelId)
      }
    }

    return deleted
  }

  async deleteByRole(guildId: string, roleId: string): Promise<number> {
    const configs = await this.repository.listByGuild(guildId)
    const deleted = await this.repository.deleteByRole(guildId, roleId)

    if (this.configuredChannelIds) {
      for (const config of configs) {
        if (config.roleId === roleId) {
          this.configuredChannelIds.delete(config.channelId)
        }
      }
    }

    return deleted
  }

  async handleMessage(message: Message): Promise<void> {
    if (!message.guild || message.author.bot) {
      return
    }

    if (this.configuredChannelIds && !this.configuredChannelIds.has(message.channel.id)) {
      return
    }

    const config = await this.repository.get(message.channel.id)

    if (!config) {
      return
    }

    await this.grantRole(message.guild, message.author.id, config.roleId)
  }

  async syncAll(client: Client<true>): Promise<PostRoleSyncResult> {
    const configs = await this.repository.list()
    this.configuredChannelIds = new Set(configs.map((config) => config.channelId))
    const result = createEmptySyncResult()

    for (const config of configs) {
      const guild = client.guilds.cache.get(config.guildId)

      if (!guild) {
        this.logger.warn(
          { guildId: config.guildId, channelId: config.channelId },
          'Skipped post role history sync because the guild is unavailable'
        )
        result.configs += 1
        result.failed += 1
        continue
      }

      addSyncResult(result, await this.syncConfig(guild, config))
    }

    this.logger.info(result, 'Finished post role history sync')
    return result
  }

  async syncGuild(guild: Guild): Promise<PostRoleSyncResult> {
    const configs = await this.repository.listByGuild(guild.id)
    const result = createEmptySyncResult()

    for (const config of configs) {
      addSyncResult(result, await this.syncConfig(guild, config))
    }

    return result
  }

  async syncChannel(guild: Guild, channelId: string): Promise<PostRoleSyncResult> {
    const config = await this.repository.get(channelId)

    if (config?.guildId !== guild.id) {
      return createEmptySyncResult()
    }

    return this.syncConfig(guild, config)
  }

  private async syncConfig(guild: Guild, config: PostRoleConfig): Promise<PostRoleSyncResult> {
    const result = createEmptySyncResult()
    result.configs = 1

    const channel = await guild.channels.fetch(config.channelId).catch((error: unknown) => {
      this.logger.warn(
        { error, guildId: guild.id, channelId: config.channelId },
        'Failed to fetch post role channel for history sync'
      )
      return null
    })

    if (!isPostRoleHistoryChannel(channel)) {
      result.failed += 1
      return result
    }

    const messages = await fetchRecentMessages(channel, config.historyLimit).catch(
      (error: unknown) => {
        this.logger.warn(
          { error, guildId: guild.id, channelId: config.channelId },
          'Failed to fetch post role message history'
        )
        return undefined
      }
    )

    if (!messages) {
      result.failed += 1
      return result
    }

    result.scannedMessages = messages.length
    const userIds = new Set<string>()

    for (const message of messages) {
      if (message.author.bot) {
        result.skippedBots += 1
        continue
      }

      userIds.add(message.author.id)
    }

    result.uniqueUsers = userIds.size

    for (const userId of userIds) {
      applyGrantResult(result, await this.grantRole(guild, userId, config.roleId))
    }

    return result
  }

  private async grantRole(guild: Guild, userId: string, roleId: string): Promise<RoleGrantResult> {
    const member = await guild.members.fetch(userId).catch(() => null)

    if (!member) {
      return 'skippedMissingMember'
    }

    if (member.user.bot) {
      return 'skippedBot'
    }

    if (member.roles.cache.has(roleId)) {
      return 'alreadyHad'
    }

    try {
      await member.roles.add(roleId, 'Post role assignment')
      return 'assigned'
    } catch (error) {
      this.logger.warn(
        { error, guildId: guild.id, userId, roleId },
        'Failed to grant post role'
      )
      return 'failed'
    }
  }
}

export function normalizePostRoleHistoryLimit(value: number | undefined): number {
  if (!Number.isFinite(value)) {
    return defaultPostRoleHistoryLimit
  }

  return Math.min(
    maxPostRoleHistoryLimit,
    Math.max(minPostRoleHistoryLimit, Math.trunc(value ?? defaultPostRoleHistoryLimit))
  )
}

export function isPostRoleHistoryChannel(channel: unknown): channel is PostRoleHistoryChannel {
  return (
    typeof channel === 'object' &&
    channel !== null &&
    'type' in channel &&
    ((channel as { type?: unknown }).type === ChannelType.GuildText ||
      (channel as { type?: unknown }).type === ChannelType.GuildAnnouncement) &&
    'messages' in channel &&
    typeof (channel as { messages?: { fetch?: unknown } }).messages?.fetch === 'function'
  )
}

export function formatPostRoleSyncResult(result: PostRoleSyncResult): string {
  return [
    `設定: ${result.configs}件`,
    `確認メッセージ: ${result.scannedMessages}件`,
    `対象メンバー: ${result.uniqueUsers}人`,
    `付与: ${result.assigned}人`,
    `付与済み: ${result.alreadyHad}人`,
    `Bot除外: ${result.skippedBots}件`,
    `不在メンバー: ${result.skippedMissingMembers}人`,
    `失敗: ${result.failed}件`
  ].join('\n')
}

async function fetchRecentMessages(
  channel: PostRoleHistoryChannel,
  limit: number
): Promise<Message<true>[]> {
  const messages: Message<true>[] = []
  let before: string | undefined

  while (messages.length < limit) {
    const batchLimit = Math.min(100, limit - messages.length)
    const batch = await channel.messages.fetch({ limit: batchLimit, before, cache: false })

    if (batch.size === 0) {
      break
    }

    messages.push(...batch.values())
    before = batch.last()?.id

    if (!before || batch.size < batchLimit) {
      break
    }
  }

  return messages
}

function createEmptySyncResult(): PostRoleSyncResult {
  return {
    configs: 0,
    scannedMessages: 0,
    uniqueUsers: 0,
    assigned: 0,
    alreadyHad: 0,
    skippedBots: 0,
    skippedMissingMembers: 0,
    failed: 0
  }
}

function addSyncResult(target: PostRoleSyncResult, source: PostRoleSyncResult): void {
  target.configs += source.configs
  target.scannedMessages += source.scannedMessages
  target.uniqueUsers += source.uniqueUsers
  target.assigned += source.assigned
  target.alreadyHad += source.alreadyHad
  target.skippedBots += source.skippedBots
  target.skippedMissingMembers += source.skippedMissingMembers
  target.failed += source.failed
}

function applyGrantResult(result: PostRoleSyncResult, grantResult: RoleGrantResult): void {
  if (grantResult === 'assigned') {
    result.assigned += 1
    return
  }

  if (grantResult === 'alreadyHad') {
    result.alreadyHad += 1
    return
  }

  if (grantResult === 'skippedBot') {
    result.skippedBots += 1
    return
  }

  if (grantResult === 'skippedMissingMember') {
    result.skippedMissingMembers += 1
    return
  }

  result.failed += 1
}
