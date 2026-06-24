import { EmbedBuilder, type Message } from 'discord.js'
import type { AppLogger } from '../../../platform/logger/logger'
import {
  defaultStickyEmbedColor,
  type StickyMessageConfig,
  type StickyMessageRepository
} from '../repositories/stickyMessageRepository'

export type StickySendableChannel = {
  id: string
  send(
    options: string | { content?: string; embeds?: EmbedBuilder[] }
  ): Promise<StickyPostedMessage>
  messages?: {
    fetch(messageId: string): Promise<StickyDeletableMessage>
  }
  fetch?(messageId: string): Promise<StickyDeletableMessage>
  fetchMessage?(messageId: string): Promise<StickyDeletableMessage>
  fetch_message?(messageId: string): Promise<StickyDeletableMessage>
}

type StickyPostedMessage = {
  id: string
  delete?(): Promise<unknown>
}

type StickyDeletableMessage = {
  delete(): Promise<unknown>
}

type StickyDeleteResult = 'deleted' | 'missing' | 'failed'

type StickyMessageServiceOptions = {
  setTimer?: (callback: () => void, delayMs: number) => NodeJS.Timeout
  clearTimer?: (timer: NodeJS.Timeout) => void
}

export class StickyMessageService {
  private readonly repository: StickyMessageRepository
  private readonly logger: AppLogger
  private readonly setTimer: (callback: () => void, delayMs: number) => NodeJS.Timeout
  private readonly clearTimer: (timer: NodeJS.Timeout) => void
  private readonly pendingTimers = new Map<string, NodeJS.Timeout>()
  private stickyChannels?: Set<string>

  constructor(
    repository: StickyMessageRepository,
    logger: AppLogger,
    options: StickyMessageServiceOptions = {}
  ) {
    this.repository = repository
    this.logger = logger
    this.setTimer = options.setTimer ?? setTimeout
    this.clearTimer = options.clearTimer ?? clearTimeout
  }

  async loadConfiguredChannels(): Promise<void> {
    const configs = await this.repository.list()
    this.stickyChannels = new Set(configs.map((config) => config.channelId))
    this.logger.info({ count: configs.length }, 'Loaded sticky message configurations')
  }

  async getConfig(channelId: string): Promise<StickyMessageConfig | undefined> {
    return this.repository.get(channelId)
  }

  async setText(
    guildId: string,
    channel: StickySendableChannel,
    content: string,
    delaySeconds: number
  ): Promise<StickyMessageConfig> {
    this.cancelPending(channel.id)
    const current = await this.repository.get(channel.id)
    await this.deletePostedMessage(channel, current)

    const postedMessage = await this.postSticky(channel, {
      guildId,
      channelId: channel.id,
      messageType: 'text',
      title: '',
      description: content,
      delaySeconds,
      updatedAt: new Date().toISOString()
    })
    const config = await this.persistPostedConfig(channel.id, postedMessage, {
      guildId,
      channelId: channel.id,
      messageId: postedMessage.id,
      messageType: 'text',
      title: '',
      description: content,
      delaySeconds,
      lastPostedAt: new Date().toISOString()
    })

    this.stickyChannels?.add(channel.id)
    this.logger.info({ guildId, channelId: channel.id }, 'Set text sticky message')

    return config
  }

  async setEmbed(
    guildId: string,
    channel: StickySendableChannel,
    input: {
      title: string
      description: string
      color?: number
      delaySeconds: number
    }
  ): Promise<StickyMessageConfig> {
    this.cancelPending(channel.id)
    const current = await this.repository.get(channel.id)
    await this.deletePostedMessage(channel, current)

    const postedMessage = await this.postSticky(channel, {
      guildId,
      channelId: channel.id,
      messageType: 'embed',
      title: input.title,
      description: input.description,
      color: input.color,
      delaySeconds: input.delaySeconds,
      updatedAt: new Date().toISOString()
    })
    const config = await this.persistPostedConfig(channel.id, postedMessage, {
      guildId,
      channelId: channel.id,
      messageId: postedMessage.id,
      messageType: 'embed',
      title: input.title,
      description: input.description,
      color: input.color,
      delaySeconds: input.delaySeconds,
      lastPostedAt: new Date().toISOString()
    })

    this.stickyChannels?.add(channel.id)
    this.logger.info({ guildId, channelId: channel.id }, 'Set embed sticky message')

    return config
  }

  async remove(channel: StickySendableChannel): Promise<StickyMessageConfig | undefined> {
    this.cancelPending(channel.id)
    const config = await this.repository.delete(channel.id)
    await this.deletePostedMessage(channel, config)
    this.stickyChannels?.delete(channel.id)

    return config
  }

  async deleteChannel(channelId: string): Promise<StickyMessageConfig | undefined> {
    this.cancelPending(channelId)
    const config = await this.repository.delete(channelId)
    this.stickyChannels?.delete(channelId)
    return config
  }

  async deleteByGuild(guildId: string): Promise<number> {
    const deleted = await this.repository.deleteByGuild(guildId)
    const configs = await this.repository.list()
    this.stickyChannels = new Set(configs.map((config) => config.channelId))
    return deleted
  }

  async handleMessage(message: Message): Promise<void> {
    if (!message.guild) {
      return
    }

    if (message.author.id === message.client.user?.id) {
      return
    }

    const channelId = message.channel.id

    if (this.stickyChannels && !this.stickyChannels.has(channelId)) {
      return
    }

    const config = await this.repository.get(channelId)

    if (!config) {
      return
    }

    if (!isStickySendableChannel(message.channel)) {
      this.logger.warn({ channelId }, 'Sticky channel is not sendable')
      return
    }

    this.scheduleRepost(message.channel, config)
  }

  cancelAll(): void {
    for (const timer of this.pendingTimers.values()) {
      this.clearTimer(timer)
    }

    this.pendingTimers.clear()
  }

  async repost(channel: StickySendableChannel, channelId = channel.id): Promise<boolean> {
    this.pendingTimers.delete(channelId)

    const config = await this.repository.get(channelId)

    if (!config) {
      return false
    }

    const deleteResult = await this.deletePostedMessage(channel, config)

    if (deleteResult === 'failed') {
      await this.repository.delete(channelId)
      this.stickyChannels?.delete(channelId)
      return false
    }

    const postedMessage = await this.postSticky(channel, config)
    await this.repository.updateMessage(channelId, postedMessage.id, new Date().toISOString())
    this.logger.info({ channelId, messageId: postedMessage.id }, 'Reposted sticky message')

    return true
  }

  private scheduleRepost(channel: StickySendableChannel, config: StickyMessageConfig): void {
    this.cancelPending(config.channelId)

    const timer = this.setTimer(() => {
      void this.repost(channel, config.channelId).catch((error) => {
        this.pendingTimers.delete(config.channelId)
        this.logger.warn({ error, channelId: config.channelId }, 'Failed to repost sticky message')
      })
    }, config.delaySeconds * 1_000)

    timer.unref?.()
    this.pendingTimers.set(config.channelId, timer)
    this.logger.debug(
      { channelId: config.channelId, delaySeconds: config.delaySeconds },
      'Scheduled sticky repost'
    )
  }

  private cancelPending(channelId: string): void {
    const timer = this.pendingTimers.get(channelId)

    if (!timer) {
      return
    }

    this.clearTimer(timer)
    this.pendingTimers.delete(channelId)
  }

  private async postSticky(
    channel: StickySendableChannel,
    config: Omit<StickyMessageConfig, 'messageId' | 'lastPostedAt'>
  ): Promise<StickyPostedMessage> {
    if (config.messageType === 'text') {
      return channel.send({ content: config.description })
    }

    return channel.send({ embeds: [createStickyEmbed(config)] })
  }

  private async persistPostedConfig(
    channelId: string,
    postedMessage: StickyPostedMessage,
    config: Omit<StickyMessageConfig, 'updatedAt'>
  ): Promise<StickyMessageConfig> {
    try {
      return await this.repository.set(config)
    } catch (error) {
      await this.deleteUntrackedPostedMessage(channelId, postedMessage)
      throw error
    }
  }

  private async deleteUntrackedPostedMessage(
    channelId: string,
    postedMessage: StickyPostedMessage
  ): Promise<void> {
    if (typeof postedMessage.delete !== 'function') {
      return
    }

    try {
      await postedMessage.delete()
    } catch (error) {
      this.logger.warn(
        { error, channelId, messageId: postedMessage.id },
        'Failed to delete untracked sticky message'
      )
    }
  }

  private async deletePostedMessage(
    channel: StickySendableChannel,
    config: StickyMessageConfig | undefined
  ): Promise<StickyDeleteResult> {
    if (!config?.messageId) {
      return 'missing'
    }

    const fetchMessage = getFetchMessage(channel)

    if (!fetchMessage) {
      return 'failed'
    }

    try {
      const oldMessage = await fetchMessage(config.messageId)
      await oldMessage.delete()
      return 'deleted'
    } catch (error) {
      if (isUnknownMessageError(error)) {
        this.logger.debug(
          { channelId: config.channelId, messageId: config.messageId },
          'Old sticky message is already missing'
        )
        return 'missing'
      }

      this.logger.warn(
        { error, channelId: config.channelId, messageId: config.messageId },
        'Failed to delete old sticky message'
      )
      return 'failed'
    }
  }
}

export function createStickyEmbed(
  config: Pick<StickyMessageConfig, 'title' | 'description' | 'color'>
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setDescription(config.description)
    .setColor(config.color ?? defaultStickyEmbedColor)

  if (config.title.trim().length > 0) {
    embed.setTitle(config.title)
  }

  return embed
}

export function isStickySendableChannel(channel: unknown): channel is StickySendableChannel {
  return (
    typeof channel === 'object' &&
    channel !== null &&
    'id' in channel &&
    typeof (channel as { id?: unknown }).id === 'string' &&
    'send' in channel &&
    typeof (channel as { send?: unknown }).send === 'function'
  )
}

function getFetchMessage(
  channel: StickySendableChannel
): ((messageId: string) => Promise<StickyDeletableMessage>) | undefined {
  if (typeof channel.messages?.fetch === 'function') {
    return (messageId) =>
      channel.messages?.fetch(messageId) ?? Promise.reject(new Error('fetch missing'))
  }

  if (typeof channel.fetch === 'function') {
    return (messageId) => channel.fetch?.(messageId) ?? Promise.reject(new Error('fetch missing'))
  }

  if (typeof channel.fetchMessage === 'function') {
    return (messageId) =>
      channel.fetchMessage?.(messageId) ?? Promise.reject(new Error('fetchMessage missing'))
  }

  if (typeof channel.fetch_message === 'function') {
    return (messageId) =>
      channel.fetch_message?.(messageId) ?? Promise.reject(new Error('fetch_message missing'))
  }

  return undefined
}

function isUnknownMessageError(error: unknown): boolean {
  const code = (error as { code?: unknown }).code
  return code === 10008 || code === '10008'
}
