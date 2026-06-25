import { EmbedBuilder, type Client, type Guild, type GuildMember, type Message } from 'discord.js'
import type { AppLogger } from '../../../platform/logger/logger'
import {
  bumpReminderCheckIntervalMs,
  bumpReminderDelayMs,
  bumpServices,
  getBumpServiceByBotId,
  getBumpServiceByKey,
  type BumpServiceDefinition,
  type BumpServiceKey
} from '../bumpServices'
import type { BumpConfig, BumpReminder, BumpRepository } from '../repositories/bumpRepository'

const defaultEmbedColor = 0x85e7ad
const historySearchLimit = 100
const reminderRetryDelayMs = 60_000
const historyBumpActor: BumpDetectionActor = {
  toString: () => '履歴内のユーザー'
}
const unknownBumpActor: BumpDetectionActor = {
  toString: () => 'bump 実行者'
}

type BumpEmbedLike = {
  title?: string | null
  description?: string | null
  fields?: readonly {
    name?: string | null
    value?: string | null
  }[]
}

export type BumpMessageLike = {
  author?: { id?: string | number } | null
  content?: string | null
  embeds?: readonly BumpEmbedLike[]
}

export type BumpSendableChannel = {
  id: string
  send(options: {
    content?: string
    embeds?: EmbedBuilder[]
    allowedMentions?: {
      roles?: string[]
      parse?: ('everyone' | 'roles' | 'users')[]
    }
  }): Promise<unknown>
}

export type BumpHistoryChannel = BumpSendableChannel & {
  messages: {
    fetch(options: { limit: number }): Promise<ReadonlyMap<string, Message>>
  }
}

type BumpDetectionActor = {
  id?: string
  toString(): string
}

type RecentBump = {
  service: BumpServiceDefinition
  message: Message
  createdAt: Date
}

type ReminderLoopOptions = {
  setInterval?: (callback: () => void, delayMs: number) => NodeJS.Timeout
  clearInterval?: (timer: NodeJS.Timeout) => void
}

export class BumpService {
  private readonly repository: BumpRepository
  private readonly logger: AppLogger
  private readonly setLoopInterval: (callback: () => void, delayMs: number) => NodeJS.Timeout
  private readonly clearLoopInterval: (timer: NodeJS.Timeout) => void
  private configuredGuildIds?: Set<string>
  private reminderTimer?: NodeJS.Timeout

  constructor(repository: BumpRepository, logger: AppLogger, options: ReminderLoopOptions = {}) {
    this.repository = repository
    this.logger = logger
    this.setLoopInterval = options.setInterval ?? setInterval
    this.clearLoopInterval = options.clearInterval ?? clearInterval
  }

  async loadConfiguredGuilds(): Promise<void> {
    const configs = await this.repository.listConfigs()
    this.configuredGuildIds = new Set(configs.map((config) => config.guildId))
    this.logger.info({ count: configs.length }, 'Loaded bump monitoring configurations')
  }

  startReminderLoop(client: Client): void {
    if (this.reminderTimer) {
      return
    }

    this.reminderTimer = this.setLoopInterval(() => {
      void this.sendDueReminders(client).catch((error) => {
        this.logger.error({ error }, 'Failed to send due bump reminders')
      })
    }, bumpReminderCheckIntervalMs)
    this.reminderTimer.unref?.()
  }

  stopReminderLoop(): void {
    if (!this.reminderTimer) {
      return
    }

    this.clearLoopInterval(this.reminderTimer)
    this.reminderTimer = undefined
  }

  async getConfig(guildId: string): Promise<BumpConfig | undefined> {
    return this.repository.getConfig(guildId)
  }

  async listRemindersByGuild(guildId: string): Promise<BumpReminder[]> {
    return this.repository.listRemindersByGuild(guildId)
  }

  async setChannel(guildId: string, channelId: string): Promise<BumpConfig> {
    const config = await this.repository.setConfig(guildId, channelId)
    this.configuredGuildIds?.add(guildId)
    return config
  }

  async disable(guildId: string): Promise<boolean> {
    const deleted = await this.repository.deleteConfig(guildId)
    await this.repository.deleteByGuild(guildId)
    this.configuredGuildIds?.delete(guildId)
    return deleted
  }

  async deleteChannel(guildId: string, channelId: string): Promise<boolean> {
    const deleted = await this.repository.deleteByChannel(guildId, channelId)

    if (deleted) {
      this.configuredGuildIds?.delete(guildId)
    }

    return deleted
  }

  async deleteByGuild(guildId: string): Promise<number> {
    const deleted = await this.repository.deleteByGuild(guildId)
    this.configuredGuildIds?.delete(guildId)
    return deleted
  }

  async setReminderEnabled(
    guildId: string,
    serviceKey: BumpServiceKey,
    isEnabled: boolean
  ): Promise<BumpReminder> {
    return this.repository.setReminderEnabled(guildId, serviceKey, isEnabled)
  }

  async setReminderRole(
    guildId: string,
    serviceKey: BumpServiceKey,
    roleId: string | undefined
  ): Promise<BumpReminder> {
    return this.repository.setReminderRole(guildId, serviceKey, roleId)
  }

  async handleMessage(message: Message): Promise<void> {
    if (!message.guild) {
      return
    }

    const detectedService = detectBumpSuccess(message)

    if (!detectedService) {
      return
    }

    const guildId = message.guild.id

    if (this.configuredGuildIds && !this.configuredGuildIds.has(guildId)) {
      return
    }

    const config = await this.repository.getConfig(guildId)

    if (config?.channelId !== message.channel.id) {
      return
    }

    const actor = await resolveBumpActor(message)

    if (actor === unknownBumpActor) {
      this.logger.warn(
        { guildId, channelId: message.channel.id, serviceKey: detectedService.key },
        'Could not resolve bump command user; sending notification with fallback actor'
      )
    }

    if (!isBumpSendableChannel(message.channel)) {
      this.logger.warn(
        { guildId, channelId: message.channel.id },
        'Bump monitoring channel is not sendable'
      )
      return
    }

    const remindAt = new Date(Date.now() + bumpReminderDelayMs)
    const reminder = await this.repository.claimBumpDetection(
      guildId,
      message.channel.id,
      detectedService.key,
      remindAt
    )

    if (!reminder) {
      return
    }

    await this.sendBumpDetectionNotification({
      guild: message.guild,
      channel: message.channel,
      service: detectedService,
      member: actor,
      remindAt,
      reminder
    })
    this.logger.info(
      {
        guildId,
        serviceKey: detectedService.key,
        userId: actor.id,
        remindAt: remindAt.toISOString()
      },
      'Detected bump success'
    )
  }

  async syncFromHistory(
    guild: Guild,
    channel: BumpHistoryChannel,
    now = new Date()
  ): Promise<{ ok: boolean; message: string; reminders: BumpReminder[] }> {
    const recentBumps = await this.findRecentBumps(channel)

    if (recentBumps.size === 0) {
      return {
        ok: false,
        message: '履歴から bump 成功メッセージを見つけられませんでした。',
        reminders: []
      }
    }

    const configured: string[] = []
    const skipped: string[] = []
    const reminders: BumpReminder[] = []

    for (const bump of recentBumps.values()) {
      const remindAt = new Date(bump.createdAt.getTime() + bumpReminderDelayMs)
      const serviceKey = bump.service.key

      if (remindAt <= now) {
        skipped.push(bump.service.name)
        continue
      }

      const reminder = await this.repository.upsertReminder(
        guild.id,
        channel.id,
        serviceKey,
        remindAt
      )
      const member = await resolveBumpMember(bump.message)
      await this.sendBumpDetectionNotification({
        guild,
        channel,
        service: bump.service,
        member: member ?? historyBumpActor,
        remindAt,
        reminder
      })
      const timestamp = Math.trunc(remindAt.getTime() / 1_000)
      configured.push(
        `・${bump.service.name}: <t:${timestamp}:F> (通知: **${
          reminder.isEnabled ? '有効' : '無効'
        }**)`
      )
      reminders.push(reminder)
    }

    if (configured.length > 0) {
      return {
        ok: true,
        message: [
          '履歴から次回通知を設定し、通知メッセージを送信しました。',
          ...configured,
          skipped.length > 0 ? `次回可能時刻を過ぎていたため未設定: ${skipped.join(' / ')}` : ''
        ]
          .filter(Boolean)
          .join('\n'),
        reminders
      }
    }

    return {
      ok: false,
      message:
        '履歴には bump 成功がありましたが、いずれも次回可能時刻を過ぎているため設定しませんでした。',
      reminders
    }
  }

  async sendDueReminders(client: Client, now = new Date()): Promise<void> {
    const reminders = await this.repository.getDueReminders(now)

    for (const reminder of reminders) {
      const retryAt = new Date(now.getTime() + reminderRetryDelayMs)
      const claimed = await this.repository.claimDueReminder(reminder.id, now, retryAt)

      if (!claimed) {
        continue
      }

      try {
        await this.sendReminder(client, reminder)
        await this.repository.clearReminder(reminder.id, retryAt)
      } catch (error) {
        this.logger.warn(
          {
            error,
            guildId: reminder.guildId,
            channelId: reminder.channelId,
            serviceKey: reminder.serviceKey,
            retryAt: retryAt.toISOString()
          },
          'Failed to send bump reminder; it will be retried'
        )
      }
    }
  }

  private async findRecentBumps(
    channel: BumpHistoryChannel
  ): Promise<Map<BumpServiceKey, RecentBump>> {
    const messages = await channel.messages.fetch({ limit: historySearchLimit }).catch((error) => {
      this.logger.warn({ error, channelId: channel.id }, 'Failed to fetch bump channel history')
      return undefined
    })

    if (!messages) {
      return new Map()
    }

    const latest = new Map<BumpServiceKey, RecentBump>()
    const sortedMessages = [...messages.values()].sort(
      (left, right) => right.createdTimestamp - left.createdTimestamp
    )

    for (const message of sortedMessages) {
      const service = detectBumpSuccess(message)

      if (!service || latest.has(service.key)) {
        continue
      }

      latest.set(service.key, {
        service,
        message,
        createdAt: message.createdAt
      })

      if (latest.size === bumpServices.length) {
        break
      }
    }

    return latest
  }

  private async sendBumpDetectionNotification(input: {
    guild: Guild
    channel: BumpSendableChannel
    service: BumpServiceDefinition
    member: BumpDetectionActor
    remindAt: Date
    reminder: BumpReminder
  }): Promise<void> {
    const roleName = resolveReminderRoleName(input.guild, input.reminder.roleId)

    await input.channel.send({
      embeds: [
        createBumpDetectionEmbed({
          service: input.service,
          member: input.member,
          remindAt: input.remindAt,
          isEnabled: input.reminder.isEnabled,
          notificationTarget: formatNotificationTarget(input.reminder.roleId, roleName)
        })
      ]
    })
  }

  private async sendReminder(client: Client, reminder: BumpReminder): Promise<void> {
    const channel = await fetchBumpSendableChannel(client, reminder.channelId)

    if (!channel) {
      this.logger.warn(
        {
          guildId: reminder.guildId,
          channelId: reminder.channelId,
          serviceKey: reminder.serviceKey
        },
        'Bump reminder channel is not sendable'
      )
      return
    }

    const target = resolveReminderMention(reminder.roleId)
    const service = getBumpServiceByKey(reminder.serviceKey)

    await channel.send({
      content: target.content,
      embeds: [createBumpReminderEmbed(service?.name ?? reminder.serviceKey)],
      allowedMentions: target.allowedMentions
    })
    this.logger.info(
      { guildId: reminder.guildId, serviceKey: reminder.serviceKey },
      'Sent bump reminder'
    )
  }
}

export function detectBumpSuccess(message: BumpMessageLike): BumpServiceDefinition | undefined {
  const authorId = String(message.author?.id ?? '')
  const service = getBumpServiceByBotId(authorId)

  if (!service) {
    return undefined
  }

  const searchableText = collectBumpSearchableText(message, service)

  if (containsBumpKeyword(searchableText, service.failureKeywords)) {
    return undefined
  }

  if (containsBumpKeyword(searchableText, service.successKeywords)) {
    return service
  }

  return undefined
}

export function createBumpDetectionEmbed(input: {
  service: Pick<BumpServiceDefinition, 'name'>
  member: { toString(): string }
  remindAt: Date
  isEnabled: boolean
  notificationTarget: string
}): EmbedBuilder {
  const timestamp = Math.trunc(input.remindAt.getTime() / 1_000)
  const description = input.isEnabled
    ? [
        `${formatBumpActor(input.member)}が **${input.service.name}** を bump しました！`,
        '',
        `次の bump リマインドは <t:${timestamp}:t> に送信します。`,
        `現在の通知先: ${input.notificationTarget}`
      ].join('\n')
    : [
        `${formatBumpActor(input.member)}が **${input.service.name}** を bump しました！`,
        '',
        '通知は現在 **無効** です。',
        `現在の通知先: ${input.notificationTarget}`
      ].join('\n')

  return new EmbedBuilder()
    .setTitle('Bump 検知')
    .setDescription(description)
    .setColor(defaultEmbedColor)
    .setTimestamp(new Date())
    .setFooter({ text: input.service.name })
}

export function createBumpReminderEmbed(serviceName: string): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle('Bump リマインダー')
    .setDescription(
      [
        `**${serviceName}** の bump ができるようになりました！`,
        '',
        'サーバーを上位に表示させるために bump しましょう。'
      ].join('\n')
    )
    .setColor(defaultEmbedColor)
    .setTimestamp(new Date())
    .setFooter({ text: serviceName })
}

export function isBumpSendableChannel(channel: unknown): channel is BumpSendableChannel {
  return (
    typeof channel === 'object' &&
    channel !== null &&
    'id' in channel &&
    typeof (channel as { id?: unknown }).id === 'string' &&
    'send' in channel &&
    typeof (channel as { send?: unknown }).send === 'function'
  )
}

export function isBumpHistoryChannel(channel: unknown): channel is BumpHistoryChannel {
  return (
    isBumpSendableChannel(channel) &&
    'messages' in channel &&
    typeof (channel as { messages?: { fetch?: unknown } }).messages?.fetch === 'function'
  )
}

async function resolveBumpActor(message: Message): Promise<BumpDetectionActor> {
  const userId = getBumpUserId(message)
  const member = userId ? await resolveBumpMember(message, userId) : undefined

  if (member) {
    return member
  }

  if (userId) {
    return {
      id: userId,
      toString: () => `<@${userId}>`
    }
  }

  return unknownBumpActor
}

async function resolveBumpMember(
  message: Message,
  interactionUserId = getBumpUserId(message)
): Promise<GuildMember | undefined> {
  if (!interactionUserId || !message.guild) {
    return undefined
  }

  return (
    message.guild.members.cache.get(interactionUserId) ??
    (await message.guild.members.fetch(interactionUserId).catch(() => null)) ??
    undefined
  )
}

function getInteractionUserId(message: Message): string | undefined {
  const metadata = message as {
    interactionMetadata?: { user?: { id?: string } | null } | null
    interaction?: { user?: { id?: string } | null } | null
  }

  return metadata.interactionMetadata?.user?.id ?? metadata.interaction?.user?.id
}

function getBumpUserId(message: Message): string | undefined {
  return getInteractionUserId(message) ?? getMentionedUserId(message)
}

function getMentionedUserId(message: Message): string | undefined {
  const mentions = message as {
    mentions?: {
      users?: {
        first?: () => { id?: string } | null
      }
    }
  }
  const mentionedUserId = mentions.mentions?.users?.first?.()?.id

  if (mentionedUserId) {
    return mentionedUserId
  }

  const mentionText = collectBumpSearchableText(
    {
      content: message.content,
      embeds: message.embeds
    },
    {
      checkTitle: true,
      checkDescription: true,
      checkFields: true,
      checkContent: true
    }
  ).join('\n')
  const mentionMatch = /<@!?(\d{15,25})>/.exec(mentionText)

  return mentionMatch?.[1]
}

function collectBumpSearchableText(
  message: Pick<BumpMessageLike, 'content' | 'embeds'>,
  options: Pick<
    BumpServiceDefinition,
    'checkTitle' | 'checkDescription' | 'checkFields' | 'checkContent'
  >
): string[] {
  const text: string[] = []

  for (const embed of message.embeds ?? []) {
    if (options.checkTitle && embed.title) {
      text.push(embed.title)
    }

    if (options.checkDescription && embed.description) {
      text.push(embed.description)
    }

    if (options.checkFields) {
      for (const field of embed.fields ?? []) {
        if (field.name) {
          text.push(field.name)
        }

        if (field.value) {
          text.push(field.value)
        }
      }
    }
  }

  if (options.checkContent && message.content) {
    text.push(message.content)
  }

  return text
}

function containsBumpKeyword(text: readonly string[], keywords: readonly string[]): boolean {
  const normalizedText = text.map(normalizeBumpText)
  return keywords.some((keyword) => {
    const normalizedKeyword = normalizeBumpText(keyword)
    return normalizedText.some((value) => value.includes(normalizedKeyword))
  })
}

function normalizeBumpText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '')
}

function formatBumpActor(actor: BumpDetectionActor): string {
  const text = actor.toString()
  return text.startsWith('<@') ? `${text} さん` : text
}

function resolveReminderRoleName(guild: Guild, roleId: string | undefined): string | undefined {
  if (!roleId) {
    return undefined
  }

  return guild.roles.cache.get(roleId)?.name
}

function formatNotificationTarget(
  roleId: string | undefined,
  roleName: string | undefined
): string {
  if (!roleId) {
    return 'メンションなし'
  }

  return roleName ? `<@&${roleId}> (${roleName})` : `<@&${roleId}>`
}

function resolveReminderMention(roleId: string | undefined): {
  content?: string
  allowedMentions: { roles?: string[]; parse?: ('everyone' | 'roles' | 'users')[] }
} {
  if (roleId) {
    return {
      content: `<@&${roleId}>`,
      allowedMentions: {
        roles: [roleId],
        parse: []
      }
    }
  }

  return {
    allowedMentions: {
      parse: []
    }
  }
}

async function fetchBumpSendableChannel(
  client: Client,
  channelId: string
): Promise<BumpSendableChannel | undefined> {
  const cached = client.channels.cache.get(channelId)

  if (isBumpSendableChannel(cached)) {
    return cached
  }

  const fetched = await client.channels.fetch(channelId).catch(() => null)

  if (isBumpSendableChannel(fetched)) {
    return fetched
  }

  return undefined
}
