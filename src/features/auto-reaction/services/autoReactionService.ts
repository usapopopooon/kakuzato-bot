import { ChannelType, type Message, type NewsChannel, type TextChannel } from 'discord.js'
import type { AppLogger } from '../../../platform/logger/logger'
import type {
  AutoReactionConfig,
  AutoReactionRepository
} from '../repositories/autoReactionRepository'

export const maxAutoReactionEmojis = 20
export const maxAutoReactionEmojiLength = 128
export const maxAutoReactionInputLength = 1_000

export type AutoReactionChannel = TextChannel | NewsChannel

export type ParsedAutoReactionEmojis = {
  emojis: string[]
  tooLong: string[]
  tooMany: boolean
}

type AutoReactionSetupInput = {
  guildId: string
  channelId: string
  emojis: string[]
}

export class AutoReactionService {
  private readonly repository: AutoReactionRepository
  private readonly logger: AppLogger
  private configuredChannelIds?: Set<string>

  constructor(repository: AutoReactionRepository, logger: AppLogger) {
    this.repository = repository
    this.logger = logger
  }

  async loadConfiguredChannels(): Promise<void> {
    const configs = await this.repository.list()
    this.configuredChannelIds = new Set(configs.map((config) => config.channelId))
    this.logger.info({ count: configs.length }, 'Loaded auto reaction configurations')
  }

  async getConfig(channelId: string): Promise<AutoReactionConfig | undefined> {
    return this.repository.get(channelId)
  }

  async listByGuild(guildId: string): Promise<AutoReactionConfig[]> {
    return this.repository.listByGuild(guildId)
  }

  async setConfig(input: AutoReactionSetupInput): Promise<AutoReactionConfig> {
    const emojis = normalizeAutoReactionEmojis(input.emojis)

    if (emojis.length === 0) {
      throw new Error('At least one auto reaction emoji is required')
    }

    const config = await this.repository.set({
      guildId: input.guildId,
      channelId: input.channelId,
      emojis
    })
    this.configuredChannelIds?.add(config.channelId)

    return config
  }

  async remove(channelId: string): Promise<boolean> {
    const deleted = await this.repository.delete(channelId)
    this.configuredChannelIds?.delete(channelId)
    return deleted
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

  async handleMessage(message: Message): Promise<void> {
    if (!message.guild || message.author.bot) {
      return
    }

    const channelId = message.channel.id

    if (this.configuredChannelIds?.has(channelId) === false) {
      return
    }

    const config = await this.repository.get(channelId)

    if (config?.guildId !== message.guild.id) {
      return
    }

    for (const emoji of config.emojis) {
      await this.react(message, config, emoji)
    }
  }

  private async react(message: Message, config: AutoReactionConfig, emoji: string): Promise<void> {
    try {
      await message.react(emoji)
    } catch (error) {
      this.logger.warn(
        {
          error,
          guildId: config.guildId,
          channelId: config.channelId,
          messageId: message.id,
          emoji
        },
        'Failed to add auto reaction'
      )
    }
  }
}

export function parseAutoReactionEmojis(input: string): ParsedAutoReactionEmojis {
  const uniqueEmojis: string[] = []
  const tooLong: string[] = []

  for (const token of input.split(/[\s,、]+/)) {
    const emoji = token.trim()

    if (!emoji) {
      continue
    }

    if (emoji.length > maxAutoReactionEmojiLength) {
      tooLong.push(emoji)
      continue
    }

    if (!uniqueEmojis.includes(emoji)) {
      uniqueEmojis.push(emoji)
    }
  }

  return {
    emojis: uniqueEmojis.slice(0, maxAutoReactionEmojis),
    tooLong,
    tooMany: uniqueEmojis.length > maxAutoReactionEmojis
  }
}

export function normalizeAutoReactionEmojis(emojis: readonly string[]): string[] {
  const normalized: string[] = []

  for (const rawEmoji of emojis) {
    const emoji = rawEmoji.trim()

    if (!emoji || emoji.length > maxAutoReactionEmojiLength) {
      continue
    }

    if (!normalized.includes(emoji)) {
      normalized.push(emoji)
    }

    if (normalized.length >= maxAutoReactionEmojis) {
      break
    }
  }

  return normalized
}

export function isAutoReactionChannel(channel: unknown): channel is AutoReactionChannel {
  if (typeof channel !== 'object' || channel === null || !('type' in channel)) {
    return false
  }

  const type = (channel as { type?: unknown }).type
  return type === ChannelType.GuildText || type === ChannelType.GuildAnnouncement
}
