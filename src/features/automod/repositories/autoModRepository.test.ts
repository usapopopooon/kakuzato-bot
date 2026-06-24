import { describe, expect, it, vi } from 'vitest'
import {
  AutoModAction,
  AutoModActionTaken,
  AutoModLogStatus,
  AutoModRepository,
  AutoModRuleType
} from './autoModRepository'

type AutoModRuleRow = {
  id: number
  guildId: string
  ruleType: AutoModRuleType
  isEnabled: boolean
  action: AutoModAction
  thresholdSeconds: number | null
  timeoutDurationSeconds: number | null
  createdAt: Date
  updatedAt: Date
}

type AutoModLogRow = {
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
}

function createRepository() {
  const now = new Date('2026-06-24T00:00:00.000Z')
  const rules = new Map<string, AutoModRuleRow>()
  const logs: AutoModLogRow[] = []
  let nextRuleId = 1
  let nextLogId = 1

  const autoModRule = {
    upsert: vi.fn(
      ({
        where,
        create,
        update
      }: {
        where: { guildId_ruleType: { guildId: string; ruleType: AutoModRuleType } }
        create: Omit<AutoModRuleRow, 'id' | 'createdAt' | 'updatedAt'>
        update: Partial<
          Omit<AutoModRuleRow, 'id' | 'guildId' | 'ruleType' | 'createdAt' | 'updatedAt'>
        >
      }) => {
        const key = `${where.guildId_ruleType.guildId}:${where.guildId_ruleType.ruleType}`
        const current = rules.get(key)
        const row: AutoModRuleRow = current
          ? { ...current, ...update, updatedAt: now }
          : {
              ...create,
              id: nextRuleId++,
              createdAt: now,
              updatedAt: now
            }
        rules.set(key, row)
        return Promise.resolve(row)
      }
    ),
    findMany: vi.fn(({ where }: { where: { guildId: string; isEnabled?: boolean } }) => {
      const rows = [...rules.values()].filter(
        (rule) =>
          rule.guildId === where.guildId &&
          (where.isEnabled === undefined || rule.isEnabled === where.isEnabled)
      )
      return Promise.resolve(rows)
    }),
    findUnique: vi.fn(({ where }: { where: { id: number } }) => {
      return Promise.resolve([...rules.values()].find((rule) => rule.id === where.id) ?? null)
    }),
    update: vi.fn()
  }

  const autoModLog = {
    create: vi.fn(
      ({
        data
      }: {
        data: Omit<AutoModLogRow, 'id' | 'createdAt' | 'failureReason' | 'completedAt'>
      }) => {
        if (logs.some((log) => log.dedupeKey === data.dedupeKey)) {
          return Promise.reject(createPrismaError('P2002'))
        }

        const row = {
          ...data,
          id: nextLogId++,
          failureReason: null,
          completedAt: null,
          createdAt: now
        }
        logs.push(row)
        return Promise.resolve(row)
      }
    ),
    update: vi.fn(
      ({
        where,
        data
      }: {
        where: { id: number }
        data: Partial<Omit<AutoModLogRow, 'id' | 'createdAt'>>
      }) => {
        const currentIndex = logs.findIndex((log) => log.id === where.id)

        if (currentIndex < 0) {
          return Promise.reject(createPrismaError('P2025'))
        }

        const row = { ...logs[currentIndex], ...data }
        logs[currentIndex] = row
        return Promise.resolve(row)
      }
    )
  }

  const autoModConfig = {
    findUnique: vi.fn(),
    upsert: vi.fn()
  }

  const prisma = {
    autoModConfig,
    autoModRule,
    autoModLog
  }

  return {
    repository: new AutoModRepository(prisma as never),
    logs
  }
}

function createPrismaError(code: string): Error & { code: string } {
  const error = new Error(code) as Error & { code: string }
  error.code = code
  return error
}

describe('AutoModRepository', () => {
  it('upserts one rule per guild and type', async () => {
    const { repository } = createRepository()

    await expect(
      repository.upsertRule({
        guildId: 'guild-1',
        ruleType: AutoModRuleType.ACCOUNT_AGE,
        action: AutoModAction.BAN,
        thresholdSeconds: 60
      })
    ).resolves.toMatchObject({
      id: 1,
      guildId: 'guild-1',
      ruleType: AutoModRuleType.ACCOUNT_AGE,
      action: AutoModAction.BAN,
      thresholdSeconds: 60
    })

    await expect(
      repository.upsertRule({
        guildId: 'guild-1',
        ruleType: AutoModRuleType.ACCOUNT_AGE,
        action: AutoModAction.KICK,
        thresholdSeconds: 120
      })
    ).resolves.toMatchObject({
      id: 1,
      action: AutoModAction.KICK,
      thresholdSeconds: 120
    })
  })

  it('does not claim duplicate logs for the same dedupe key', async () => {
    const { repository, logs } = createRepository()
    const rule = await repository.upsertRule({
      guildId: 'guild-1',
      ruleType: AutoModRuleType.NO_AVATAR,
      action: AutoModAction.BAN
    })

    await expect(
      repository.claimLog({
        guildId: 'guild-1',
        userId: 'user-1',
        username: 'user#0001',
        ruleId: rule.id,
        actionTaken: AutoModActionTaken.BANNED,
        reason: 'アバターが未設定です。',
        dedupeKey: 'join:guild-1:user-1:1:1782259200000'
      })
    ).resolves.toMatchObject({
      id: 1,
      status: AutoModLogStatus.PENDING
    })

    await expect(
      repository.claimLog({
        guildId: 'guild-1',
        userId: 'user-1',
        username: 'user#0001',
        ruleId: rule.id,
        actionTaken: AutoModActionTaken.BANNED,
        reason: 'アバターが未設定です。',
        dedupeKey: 'join:guild-1:user-1:1:1782259200000'
      })
    ).resolves.toBeUndefined()
    expect(logs).toHaveLength(1)
  })

  it('marks claimed logs as succeeded or failed', async () => {
    const { repository } = createRepository()
    const rule = await repository.upsertRule({
      guildId: 'guild-1',
      ruleType: AutoModRuleType.NO_AVATAR,
      action: AutoModAction.BAN
    })
    const log = await repository.claimLog({
      guildId: 'guild-1',
      userId: 'user-1',
      username: 'user#0001',
      ruleId: rule.id,
      actionTaken: AutoModActionTaken.BANNED,
      reason: 'アバターが未設定です。',
      dedupeKey: 'join:guild-1:user-1:1:1782259200000'
    })

    await expect(repository.markLogSucceeded(log?.id ?? 0)).resolves.toMatchObject({
      status: AutoModLogStatus.SUCCEEDED
    })
    await expect(
      repository.markLogFailed(log?.id ?? 0, 'Missing Permissions')
    ).resolves.toMatchObject({
      status: AutoModLogStatus.FAILED,
      failureReason: 'Missing Permissions'
    })
  })
})
