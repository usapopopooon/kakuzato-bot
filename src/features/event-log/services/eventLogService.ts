import type { EmbedBuilder, Guild } from 'discord.js'
import type { AppLogger } from '../../../platform/logger/logger'
import type { EventLogCategory } from '../eventLogCategories'
import type {
  EventLogConfig,
  EventLogConfigRepository
} from '../repositories/eventLogConfigRepository'

export type EventLogSendableChannel = {
  id: string
  send(options: { embeds: EmbedBuilder[] }): Promise<unknown>
}

export class EventLogService {
  private readonly repository: EventLogConfigRepository
  private readonly logger: AppLogger

  constructor(repository: EventLogConfigRepository, logger: AppLogger) {
    this.repository = repository
    this.logger = logger
  }

  async getConfig(guildId: string): Promise<EventLogConfig | undefined> {
    return this.repository.get(guildId)
  }

  async setChannel(guildId: string, channelId: string): Promise<EventLogConfig> {
    return this.repository.setChannel(guildId, channelId)
  }

  async setCategory(
    guildId: string,
    category: EventLogCategory,
    enabled: boolean
  ): Promise<EventLogConfig | undefined> {
    return this.repository.setCategory(guildId, category, enabled)
  }

  async disable(guildId: string): Promise<EventLogConfig | undefined> {
    return this.repository.disable(guildId)
  }

  async send(guild: Guild, category: EventLogCategory, embed: EmbedBuilder): Promise<boolean> {
    const config = await this.repository.get(guild.id)

    if (!config?.enabled || !config.enabledCategories.includes(category)) {
      return false
    }

    const channel = await this.fetchSendableChannel(guild, config.channelId)

    if (!channel) {
      this.logger.warn(
        { guildId: guild.id, channelId: config.channelId },
        'Event log channel is not sendable'
      )
      return false
    }

    try {
      await channel.send({ embeds: [embed] })
      return true
    } catch (error) {
      this.logger.warn(
        { error, guildId: guild.id, channelId: channel.id },
        'Failed to send event log'
      )
      return false
    }
  }

  private async fetchSendableChannel(
    guild: Guild,
    channelId: string
  ): Promise<EventLogSendableChannel | undefined> {
    const cached = guild.channels.cache.get(channelId)

    if (isEventLogSendableChannel(cached)) {
      return cached
    }

    const fetched = await guild.channels.fetch(channelId).catch(() => null)

    if (isEventLogSendableChannel(fetched)) {
      return fetched
    }

    return undefined
  }
}

export function isEventLogSendableChannel(channel: unknown): channel is EventLogSendableChannel {
  return (
    typeof channel === 'object' &&
    channel !== null &&
    'id' in channel &&
    typeof (channel as { id?: unknown }).id === 'string' &&
    'send' in channel &&
    typeof (channel as { send?: unknown }).send === 'function'
  )
}
