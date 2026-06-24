import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AutoModAction,
  AutoModActionTaken,
  AutoModLogStatus,
  AutoModRuleType,
  type AutoModRule
} from '../repositories/autoModRepository'
import type { AutoModRepository } from '../repositories/autoModRepository'
import { AutoModJoinBlocklist } from './autoModJoinBlocklist'
import { AutoModService, evaluateRule } from './autoModService'

const now = new Date('2026-06-24T00:00:00.000Z')

describe('AutoMod rule evaluation', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('matches users without a custom avatar', () => {
    const member = createMember({ avatar: null })
    const rule = createRule({ ruleType: AutoModRuleType.NO_AVATAR })

    expect(evaluateRule(rule, member as never)).toBe('アバターが未設定です。')
  })

  it('matches accounts younger than the configured threshold', () => {
    vi.useFakeTimers()
    vi.setSystemTime(now)
    const member = createMember({
      avatar: 'avatar-hash',
      createdTimestamp: now.getTime() - 59 * 60 * 1000
    })
    const rule = createRule({
      ruleType: AutoModRuleType.ACCOUNT_AGE,
      thresholdSeconds: 60 * 60
    })

    expect(evaluateRule(rule, member as never)).toContain('設定閾値 1時間 未満')
  })
})

describe('AutoModService', () => {
  it('bans matching members and sends a log embed', async () => {
    const channel = {
      id: 'log-channel-1',
      send: vi.fn().mockResolvedValue(undefined)
    }
    const member = createMember({
      avatar: null,
      channel
    })
    const rule = createRule({
      ruleType: AutoModRuleType.NO_AVATAR,
      action: AutoModAction.BAN
    })
    const repository = createRepository({
      rules: [rule],
      logChannelId: channel.id
    })
    const service = new AutoModService(repository as unknown as AutoModRepository, createLogger())

    const result = await service.handleMemberJoin(member as never)

    expect(result?.actionTaken).toBe(AutoModActionTaken.BANNED)
    expect(member.ban).toHaveBeenCalledWith({ reason: '[AutoMod] アバターが未設定です。' })
    expect(repository.claimLog).toHaveBeenCalledWith(
      expect.objectContaining({
        guildId: 'guild-1',
        userId: 'user-1',
        ruleId: rule.id,
        actionTaken: AutoModActionTaken.BANNED,
        dedupeKey: 'join:guild-1:user-1:1:1782259200000'
      })
    )
    expect(repository.markLogSucceeded).toHaveBeenCalledWith(1)
    const sent = firstSentEmbed(channel.send)
    expect(sent.data.title).toBe('[AutoMod] BAN を実行しました')
  })

  it('marks failed actions without sending a log embed', async () => {
    const channel = {
      id: 'log-channel-1',
      send: vi.fn().mockResolvedValue(undefined)
    }
    const member = createMember({
      avatar: null,
      channel
    })
    member.ban.mockRejectedValueOnce(new Error('Missing Permissions'))
    const repository = createRepository({
      rules: [createRule({ ruleType: AutoModRuleType.NO_AVATAR })],
      logChannelId: channel.id
    })
    const service = new AutoModService(repository as unknown as AutoModRepository, createLogger())

    await expect(service.handleMemberJoin(member as never)).resolves.toBeUndefined()

    expect(repository.markLogFailed).toHaveBeenCalledWith(1, 'Missing Permissions')
    expect(repository.markLogSucceeded).not.toHaveBeenCalled()
    expect(channel.send).not.toHaveBeenCalled()
  })

  it('marks BAN and KICK actions as welcome-blocked after success', async () => {
    const blocklist = new AutoModJoinBlocklist()
    const member = createMember({ avatar: null })
    const repository = createRepository({
      rules: [createRule({ ruleType: AutoModRuleType.NO_AVATAR })]
    })
    const service = new AutoModService(
      repository as unknown as AutoModRepository,
      createLogger(),
      blocklist
    )

    await service.handleMemberJoin(member as never)

    expect(blocklist.isBlocked('guild-1', 'user-1')).toBe(true)
  })

  it('does not act on bots', async () => {
    const member = createMember({
      bot: true,
      avatar: null
    })
    const repository = createRepository({
      rules: [createRule({ ruleType: AutoModRuleType.NO_AVATAR })]
    })
    const service = new AutoModService(repository as unknown as AutoModRepository, createLogger())

    await service.handleMemberJoin(member as never)

    expect(repository.listEnabledRules).not.toHaveBeenCalled()
    expect(member.ban).not.toHaveBeenCalled()
  })
})

function createRule(input: Partial<AutoModRule> = {}): AutoModRule {
  return {
    id: input.id ?? 1,
    guildId: input.guildId ?? 'guild-1',
    ruleType: input.ruleType ?? AutoModRuleType.NO_AVATAR,
    isEnabled: input.isEnabled ?? true,
    action: input.action ?? AutoModAction.BAN,
    thresholdSeconds: input.thresholdSeconds,
    timeoutDurationSeconds: input.timeoutDurationSeconds,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now.toISOString()
  }
}

function createMember(
  input: {
    bot?: boolean
    avatar?: string | null
    createdTimestamp?: number
    channel?: unknown
  } = {}
) {
  const channel = input.channel ?? { id: 'log-channel-1', send: vi.fn() }
  return {
    id: 'user-1',
    displayName: 'New Member',
    joinedTimestamp: now.getTime(),
    user: {
      id: 'user-1',
      bot: input.bot ?? false,
      avatar: input.avatar === undefined ? 'avatar-hash' : input.avatar,
      tag: 'new-member#0001',
      createdTimestamp: input.createdTimestamp ?? now.getTime() - 24 * 60 * 60 * 1000,
      displayAvatarURL: () => 'https://cdn.example.com/avatar.png',
      toString: () => '<@user-1>'
    },
    guild: {
      id: 'guild-1',
      name: 'Test Guild',
      channels: {
        cache: new Map([['log-channel-1', channel]]),
        fetch: vi.fn()
      }
    },
    ban: vi.fn().mockResolvedValue(undefined),
    kick: vi.fn().mockResolvedValue(undefined),
    timeout: vi.fn().mockResolvedValue(undefined)
  }
}

function createRepository(input: { rules?: AutoModRule[]; logChannelId?: string } = {}) {
  return {
    listEnabledRules: vi.fn().mockResolvedValue(input.rules ?? []),
    claimLog: vi.fn().mockResolvedValue({
      id: 1,
      guildId: 'guild-1',
      userId: 'user-1',
      username: 'new-member#0001',
      ruleId: 1,
      actionTaken: AutoModActionTaken.BANNED,
      reason: 'アバターが未設定です。',
      status: AutoModLogStatus.PENDING,
      dedupeKey: 'join:guild-1:user-1:1:1782259200000',
      createdAt: now.toISOString()
    }),
    markLogSucceeded: vi.fn().mockResolvedValue({
      id: 1,
      guildId: 'guild-1',
      userId: 'user-1',
      username: 'new-member#0001',
      ruleId: 1,
      actionTaken: AutoModActionTaken.BANNED,
      reason: 'アバターが未設定です。',
      status: AutoModLogStatus.SUCCEEDED,
      dedupeKey: 'join:guild-1:user-1:1:1782259200000',
      completedAt: now.toISOString(),
      createdAt: now.toISOString()
    }),
    markLogFailed: vi.fn().mockResolvedValue({
      id: 1,
      guildId: 'guild-1',
      userId: 'user-1',
      username: 'new-member#0001',
      ruleId: 1,
      actionTaken: AutoModActionTaken.BANNED,
      reason: 'アバターが未設定です。',
      status: AutoModLogStatus.FAILED,
      dedupeKey: 'join:guild-1:user-1:1:1782259200000',
      failureReason: 'Missing Permissions',
      completedAt: now.toISOString(),
      createdAt: now.toISOString()
    }),
    getConfig: vi.fn().mockResolvedValue(
      input.logChannelId
        ? {
            guildId: 'guild-1',
            logChannelId: input.logChannelId,
            updatedAt: now.toISOString()
          }
        : undefined
    )
  }
}

function createLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn()
  } as never
}

function firstSentEmbed(send: ReturnType<typeof vi.fn>): { data: { title?: string } } {
  const firstCall = send.mock.calls[0]

  if (!firstCall) {
    throw new Error('send was not called')
  }

  const payload = firstCall[0] as { embeds?: { data: { title?: string } }[] }
  const embed = payload.embeds?.[0]

  if (!embed) {
    throw new Error('embed was not sent')
  }

  return embed
}
