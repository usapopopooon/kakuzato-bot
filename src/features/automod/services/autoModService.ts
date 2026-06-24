import {
  AutoModAction,
  AutoModActionTaken,
  AutoModRuleType,
  type AutoModRule
} from '../repositories/autoModRepository'
import { createAutoModLogEmbed, formatAutoModRuleType, formatDuration } from './autoModEmbeds'
import type { AppLogger } from '../../../platform/logger/logger'
import type {
  AutoModConfig,
  AutoModLog,
  AutoModRepository
} from '../repositories/autoModRepository'
import type { EmbedBuilder, Guild, GuildMember } from 'discord.js'
import type { AutoModJoinBlocklist } from './autoModJoinBlocklist'

const defaultTimeoutDurationSeconds = 60 * 60

export type AutoModSendableChannel = {
  id: string
  send(options: { embeds: EmbedBuilder[] }): Promise<unknown>
}

export type AutoModExecution = {
  rule: AutoModRule
  actionTaken: AutoModActionTaken
  reason: string
  log?: AutoModLog
}

export class AutoModService {
  private readonly repository: AutoModRepository
  private readonly logger: AppLogger
  private readonly joinBlocklist?: AutoModJoinBlocklist

  constructor(
    repository: AutoModRepository,
    logger: AppLogger,
    joinBlocklist?: AutoModJoinBlocklist
  ) {
    this.repository = repository
    this.logger = logger
    this.joinBlocklist = joinBlocklist
  }

  async getConfig(guildId: string): Promise<AutoModConfig | undefined> {
    return this.repository.getConfig(guildId)
  }

  async setLogChannel(guildId: string, channelId: string): Promise<AutoModConfig> {
    return this.repository.setLogChannel(guildId, channelId)
  }

  async disableLogChannel(guildId: string): Promise<AutoModConfig> {
    return this.repository.disableLogChannel(guildId)
  }

  async listRules(guildId: string): Promise<AutoModRule[]> {
    return this.repository.listRules(guildId)
  }

  async configureNoAvatar(input: {
    guildId: string
    action: AutoModAction
    timeoutDurationSeconds?: number
  }): Promise<AutoModRule> {
    return this.repository.upsertRule({
      guildId: input.guildId,
      ruleType: AutoModRuleType.NO_AVATAR,
      action: input.action,
      timeoutDurationSeconds: normalizeTimeoutDuration(input.action, input.timeoutDurationSeconds)
    })
  }

  async configureAccountAge(input: {
    guildId: string
    thresholdSeconds: number
    action: AutoModAction
    timeoutDurationSeconds?: number
  }): Promise<AutoModRule> {
    return this.repository.upsertRule({
      guildId: input.guildId,
      ruleType: AutoModRuleType.ACCOUNT_AGE,
      action: input.action,
      thresholdSeconds: input.thresholdSeconds,
      timeoutDurationSeconds: normalizeTimeoutDuration(input.action, input.timeoutDurationSeconds)
    })
  }

  async disableRule(guildId: string, ruleType: AutoModRuleType): Promise<AutoModRule | undefined> {
    return this.repository.disableRule(guildId, ruleType)
  }

  async handleMemberJoin(member: GuildMember): Promise<AutoModExecution | undefined> {
    if (member.user.bot) {
      return undefined
    }

    const rules = await this.repository.listEnabledRules(member.guild.id)

    for (const rule of rules) {
      const reason = evaluateRule(rule, member)

      if (reason) {
        return this.executeAction(member, rule, reason)
      }
    }

    return undefined
  }

  private async executeAction(
    member: GuildMember,
    rule: AutoModRule,
    reason: string
  ): Promise<AutoModExecution | undefined> {
    const actionTaken = toActionTaken(rule.action)
    const fullReason = `[AutoMod] ${reason}`
    const username = member.user.tag

    const log = await this.repository.claimLog({
      guildId: member.guild.id,
      userId: member.id,
      username,
      ruleId: rule.id,
      actionTaken,
      reason,
      dedupeKey: createAutoModDedupeKey(member, rule)
    })

    if (!log) {
      this.logger.info(
        { guildId: member.guild.id, userId: member.id, ruleId: rule.id },
        'AutoMod action already claimed'
      )
      return undefined
    }

    try {
      await applyAction(member, rule, fullReason)
    } catch (error) {
      await this.markLogFailed(log.id, error)
      this.logger.warn(
        {
          error,
          guildId: member.guild.id,
          userId: member.id,
          ruleId: rule.id,
          action: rule.action
        },
        'Failed to apply AutoMod action'
      )
      return undefined
    }

    if (shouldBlockWelcome(actionTaken)) {
      this.joinBlocklist?.markBlocked(member.guild.id, member.id)
    }

    const succeededLog = await this.repository.markLogSucceeded(log.id)
    await this.sendLog(member.guild, member, rule, actionTaken, reason)

    this.logger.info(
      { guildId: member.guild.id, userId: member.id, ruleId: rule.id, actionTaken },
      'Applied AutoMod action'
    )

    return { rule, actionTaken, reason, log: succeededLog }
  }

  private async markLogFailed(logId: number, error: unknown): Promise<void> {
    const failureReason = formatErrorMessage(error)

    try {
      await this.repository.markLogFailed(logId, failureReason)
    } catch (logError) {
      this.logger.warn({ error: logError, logId }, 'Failed to mark AutoMod log as failed')
    }
  }

  private async sendLog(
    guild: Guild,
    member: GuildMember,
    rule: AutoModRule,
    actionTaken: AutoModActionTaken,
    reason: string
  ): Promise<void> {
    const config = await this.repository.getConfig(guild.id)

    if (!config?.logChannelId) {
      return
    }

    const channel = await fetchAutoModSendableChannel(guild, config.logChannelId)

    if (!channel) {
      this.logger.warn(
        { guildId: guild.id, channelId: config.logChannelId },
        'AutoMod log channel is not sendable'
      )
      return
    }

    const embed = createAutoModLogEmbed({
      guild,
      member,
      rule,
      actionTaken,
      reason
    })

    try {
      await channel.send({ embeds: [embed] })
    } catch (error) {
      this.logger.warn(
        { error, guildId: guild.id, channelId: channel.id },
        'Failed to send AutoMod log'
      )
    }
  }
}

export function createAutoModDedupeKey(member: GuildMember, rule: Pick<AutoModRule, 'id'>): string {
  const joinedAt = member.joinedTimestamp ?? 0
  return `join:${member.guild.id}:${member.id}:${rule.id}:${joinedAt}`
}

export function evaluateRule(rule: AutoModRule, member: GuildMember): string | undefined {
  if (rule.ruleType === AutoModRuleType.NO_AVATAR) {
    return member.user.avatar === null ? 'アバターが未設定です。' : undefined
  }

  if (rule.ruleType === AutoModRuleType.ACCOUNT_AGE) {
    return evaluateAccountAge(rule, member)
  }

  return undefined
}

function evaluateAccountAge(rule: AutoModRule, member: GuildMember): string | undefined {
  if (!rule.thresholdSeconds) {
    return undefined
  }

  const accountAgeSeconds = Math.max(
    0,
    Math.floor((Date.now() - member.user.createdTimestamp) / 1000)
  )

  if (accountAgeSeconds >= rule.thresholdSeconds) {
    return undefined
  }

  return `アカウント作成から ${formatDuration(
    accountAgeSeconds
  )} で、設定閾値 ${formatDuration(rule.thresholdSeconds)} 未満です。`
}

function normalizeTimeoutDuration(
  action: AutoModAction,
  timeoutDurationSeconds: number | undefined
): number | undefined {
  if (action !== AutoModAction.TIMEOUT) {
    return undefined
  }

  return timeoutDurationSeconds ?? defaultTimeoutDurationSeconds
}

function toActionTaken(action: AutoModAction): AutoModActionTaken {
  if (action === AutoModAction.BAN) {
    return AutoModActionTaken.BANNED
  }
  if (action === AutoModAction.KICK) {
    return AutoModActionTaken.KICKED
  }

  return AutoModActionTaken.TIMED_OUT
}

function shouldBlockWelcome(actionTaken: AutoModActionTaken): boolean {
  return actionTaken === AutoModActionTaken.BANNED || actionTaken === AutoModActionTaken.KICKED
}

async function applyAction(member: GuildMember, rule: AutoModRule, reason: string): Promise<void> {
  if (rule.action === AutoModAction.BAN) {
    await member.ban({ reason })
    return
  }

  if (rule.action === AutoModAction.KICK) {
    await member.kick(reason)
    return
  }

  await member.timeout(
    (rule.timeoutDurationSeconds ?? defaultTimeoutDurationSeconds) * 1000,
    reason
  )
}

async function fetchAutoModSendableChannel(
  guild: Guild,
  channelId: string
): Promise<AutoModSendableChannel | undefined> {
  const cached = guild.channels.cache.get(channelId)

  if (isAutoModSendableChannel(cached)) {
    return cached
  }

  const fetched = await guild.channels.fetch(channelId).catch(() => null)

  if (isAutoModSendableChannel(fetched)) {
    return fetched
  }

  return undefined
}

export function isAutoModSendableChannel(channel: unknown): channel is AutoModSendableChannel {
  return (
    typeof channel === 'object' &&
    channel !== null &&
    'id' in channel &&
    typeof (channel as { id?: unknown }).id === 'string' &&
    'send' in channel &&
    typeof (channel as { send?: unknown }).send === 'function'
  )
}

export function formatAutoModRuleStatus(rule: AutoModRule): string {
  const parts = [
    `#${rule.id}`,
    formatAutoModRuleType(rule.ruleType),
    rule.isEnabled ? '有効' : '無効',
    `アクション: ${formatAction(rule.action)}`
  ]

  if (rule.ruleType === AutoModRuleType.ACCOUNT_AGE && rule.thresholdSeconds) {
    parts.push(`閾値: ${formatDuration(rule.thresholdSeconds)}`)
  }

  if (rule.action === AutoModAction.TIMEOUT && rule.timeoutDurationSeconds) {
    parts.push(`タイムアウト: ${formatDuration(rule.timeoutDurationSeconds)}`)
  }

  return parts.join(' / ')
}

export function formatAction(action: AutoModAction): string {
  if (action === AutoModAction.BAN) {
    return 'BAN'
  }
  if (action === AutoModAction.KICK) {
    return 'KICK'
  }

  return 'タイムアウト'
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === 'string') {
    return error
  }

  return 'Unknown error'
}
