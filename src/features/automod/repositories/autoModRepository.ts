import {
  AutoModAction,
  AutoModActionTaken,
  AutoModLogStatus,
  AutoModRuleType
} from '@prisma/client'
import type { AppPrismaClient } from '../../../platform/database/prisma'

export { AutoModAction, AutoModActionTaken, AutoModLogStatus, AutoModRuleType }

export type AutoModConfig = {
  guildId: string
  logChannelId?: string
  updatedAt: string
}

export type AutoModRule = {
  id: number
  guildId: string
  ruleType: AutoModRuleType
  isEnabled: boolean
  action: AutoModAction
  thresholdSeconds?: number
  timeoutDurationSeconds?: number
  createdAt: Date
  updatedAt: string
}

export type AutoModLog = {
  id: number
  guildId: string
  userId: string
  username: string
  ruleId: number
  actionTaken: AutoModActionTaken
  reason: string
  status: AutoModLogStatus
  dedupeKey: string
  failureReason?: string
  completedAt?: string
  createdAt: string
}

type AutoModPrisma = Pick<AppPrismaClient, 'autoModConfig' | 'autoModRule' | 'autoModLog'>

export class AutoModRepository {
  private readonly prisma: AutoModPrisma

  constructor(prisma: AutoModPrisma) {
    this.prisma = prisma
  }

  async getConfig(guildId: string): Promise<AutoModConfig | undefined> {
    const config = await this.prisma.autoModConfig.findUnique({
      where: { guildId }
    })

    return config ? toAutoModConfig(config) : undefined
  }

  async setLogChannel(guildId: string, logChannelId: string): Promise<AutoModConfig> {
    const config = await this.prisma.autoModConfig.upsert({
      where: { guildId },
      create: { guildId, logChannelId },
      update: { logChannelId }
    })

    return toAutoModConfig(config)
  }

  async disableLogChannel(guildId: string): Promise<AutoModConfig> {
    const config = await this.prisma.autoModConfig.upsert({
      where: { guildId },
      create: { guildId, logChannelId: null },
      update: { logChannelId: null }
    })

    return toAutoModConfig(config)
  }

  async listRules(guildId: string): Promise<AutoModRule[]> {
    const rules = await this.prisma.autoModRule.findMany({
      where: { guildId },
      orderBy: [{ id: 'asc' }]
    })

    return rules.map(toAutoModRule)
  }

  async listEnabledRules(guildId: string): Promise<AutoModRule[]> {
    const rules = await this.prisma.autoModRule.findMany({
      where: { guildId, isEnabled: true },
      orderBy: [{ id: 'asc' }]
    })

    return rules.map(toAutoModRule)
  }

  async upsertRule(input: {
    guildId: string
    ruleType: AutoModRuleType
    action: AutoModAction
    thresholdSeconds?: number
    timeoutDurationSeconds?: number
  }): Promise<AutoModRule> {
    const rule = await this.prisma.autoModRule.upsert({
      where: {
        guildId_ruleType: {
          guildId: input.guildId,
          ruleType: input.ruleType
        }
      },
      create: {
        guildId: input.guildId,
        ruleType: input.ruleType,
        action: input.action,
        isEnabled: true,
        thresholdSeconds: input.thresholdSeconds ?? null,
        timeoutDurationSeconds: input.timeoutDurationSeconds ?? null
      },
      update: {
        action: input.action,
        isEnabled: true,
        thresholdSeconds: input.thresholdSeconds ?? null,
        timeoutDurationSeconds: input.timeoutDurationSeconds ?? null
      }
    })

    return toAutoModRule(rule)
  }

  async disableRule(guildId: string, ruleType: AutoModRuleType): Promise<AutoModRule | undefined> {
    const rule = await this.prisma.autoModRule
      .update({
        where: {
          guildId_ruleType: {
            guildId,
            ruleType
          }
        },
        data: { isEnabled: false }
      })
      .catch((error: unknown) => {
        if (isRecordNotFoundError(error)) {
          return undefined
        }

        throw error
      })

    return rule ? toAutoModRule(rule) : undefined
  }

  async claimLog(input: {
    guildId: string
    userId: string
    username: string
    ruleId: number
    actionTaken: AutoModActionTaken
    reason: string
    dedupeKey: string
  }): Promise<AutoModLog | undefined> {
    const log = await this.prisma.autoModLog
      .create({
        data: {
          guildId: input.guildId,
          userId: input.userId,
          username: input.username,
          ruleId: input.ruleId,
          actionTaken: input.actionTaken,
          reason: input.reason,
          status: AutoModLogStatus.PENDING,
          dedupeKey: input.dedupeKey
        }
      })
      .catch((error: unknown) => {
        if (isUniqueConstraintError(error) || isForeignKeyError(error)) {
          return undefined
        }

        throw error
      })

    return log ? toAutoModLog(log) : undefined
  }

  async markLogSucceeded(logId: number, completedAt = new Date()): Promise<AutoModLog> {
    const log = await this.prisma.autoModLog.update({
      where: { id: logId },
      data: {
        status: AutoModLogStatus.SUCCEEDED,
        completedAt
      }
    })

    return toAutoModLog(log)
  }

  async markLogFailed(
    logId: number,
    failureReason: string,
    completedAt = new Date()
  ): Promise<AutoModLog> {
    const log = await this.prisma.autoModLog.update({
      where: { id: logId },
      data: {
        status: AutoModLogStatus.FAILED,
        failureReason,
        completedAt
      }
    })

    return toAutoModLog(log)
  }
}

function toAutoModConfig(config: {
  guildId: string
  logChannelId: string | null
  updatedAt: Date
}): AutoModConfig {
  return {
    guildId: config.guildId,
    logChannelId: config.logChannelId ?? undefined,
    updatedAt: config.updatedAt.toISOString()
  }
}

function toAutoModRule(rule: {
  id: number
  guildId: string
  ruleType: AutoModRuleType
  isEnabled: boolean
  action: AutoModAction
  thresholdSeconds: number | null
  timeoutDurationSeconds: number | null
  createdAt: Date
  updatedAt: Date
}): AutoModRule {
  return {
    id: rule.id,
    guildId: rule.guildId,
    ruleType: rule.ruleType,
    isEnabled: rule.isEnabled,
    action: rule.action,
    thresholdSeconds: rule.thresholdSeconds ?? undefined,
    timeoutDurationSeconds: rule.timeoutDurationSeconds ?? undefined,
    createdAt: rule.createdAt,
    updatedAt: rule.updatedAt.toISOString()
  }
}

function toAutoModLog(log: {
  id: number
  guildId: string
  userId: string
  username: string
  ruleId: number
  actionTaken: AutoModActionTaken
  reason: string
  status: AutoModLogStatus
  dedupeKey: string
  failureReason: string | null
  completedAt: Date | null
  createdAt: Date
}): AutoModLog {
  return {
    id: log.id,
    guildId: log.guildId,
    userId: log.userId,
    username: log.username,
    ruleId: log.ruleId,
    actionTaken: log.actionTaken,
    reason: log.reason,
    status: log.status,
    dedupeKey: log.dedupeKey,
    failureReason: log.failureReason ?? undefined,
    completedAt: log.completedAt?.toISOString(),
    createdAt: log.createdAt.toISOString()
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return isPrismaError(error, 'P2002')
}

function isForeignKeyError(error: unknown): boolean {
  return isPrismaError(error, 'P2003')
}

function isRecordNotFoundError(error: unknown): boolean {
  return isPrismaError(error, 'P2025')
}

function isPrismaError(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === code
  )
}
