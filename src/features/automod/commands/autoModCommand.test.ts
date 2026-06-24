import { MessageFlags, PermissionFlagsBits, type ChatInputCommandInteraction } from 'discord.js'
import { describe, expect, it, vi } from 'vitest'
import type { AutoModService } from '../services/autoModService'
import { AutoModAction } from '../repositories/autoModRepository'
import { createAutoModCommand } from './autoModCommand'

type ReplyPayload = {
  content?: string
  flags?: MessageFlags
  embeds?: unknown[]
}

type ReplyMock = ReturnType<typeof vi.fn<(payload: ReplyPayload) => void>>

describe('automod command', () => {
  it('rejects non-admin users before changing config', async () => {
    const service = {
      configureNoAvatar: vi.fn()
    }
    const reply = createReplyMock()
    const command = createAutoModCommand(service as unknown as AutoModService)

    await command.execute({
      inCachedGuild: () => true,
      memberPermissions: { has: () => false },
      reply
    } as unknown as ChatInputCommandInteraction)

    expect(service.configureNoAvatar).not.toHaveBeenCalled()
    expect(reply).toHaveBeenCalledWith({
      content: 'このコマンドは管理者のみ実行できます。',
      flags: MessageFlags.Ephemeral
    })
  })

  it('stores the selected AutoMod log channel', async () => {
    const service = {
      setLogChannel: vi.fn().mockResolvedValue(undefined)
    }
    const fetchedChannel = { id: 'log-channel-1', send: vi.fn() }
    const reply = createReplyMock()
    const command = createAutoModCommand(service as unknown as AutoModService)

    await command.execute({
      inCachedGuild: () => true,
      guildId: 'guild-1',
      guild: {
        channels: {
          fetch: vi.fn().mockResolvedValue(fetchedChannel)
        }
      },
      memberPermissions: createAdminPermissions(),
      options: {
        getSubcommandGroup: () => 'log',
        getSubcommand: () => 'set',
        getChannel: () => ({ id: 'log-channel-1' })
      },
      reply
    } as unknown as ChatInputCommandInteraction)

    expect(service.setLogChannel).toHaveBeenCalledWith('guild-1', 'log-channel-1')
    expect(reply).toHaveBeenCalledWith({
      content: 'AutoMod ログの送信先を <#log-channel-1> に設定しました。',
      flags: MessageFlags.Ephemeral
    })
  })

  it('configures the no-avatar rule', async () => {
    const service = {
      configureNoAvatar: vi.fn().mockResolvedValue({
        id: 1,
        ruleType: 'NO_AVATAR',
        isEnabled: true,
        action: AutoModAction.KICK
      })
    }
    const reply = createReplyMock()
    const command = createAutoModCommand(service as unknown as AutoModService)

    await command.execute({
      inCachedGuild: () => true,
      guildId: 'guild-1',
      guild: createGuildWithBotPermissions(PermissionFlagsBits.KickMembers),
      memberPermissions: createAdminPermissions(),
      options: {
        getSubcommandGroup: () => 'no-avatar',
        getSubcommand: () => 'set',
        getString: () => AutoModAction.KICK,
        getInteger: () => null
      },
      reply
    } as unknown as ChatInputCommandInteraction)

    expect(service.configureNoAvatar).toHaveBeenCalledWith({
      guildId: 'guild-1',
      action: AutoModAction.KICK,
      timeoutDurationSeconds: undefined
    })
    expect(firstReply(reply).content).toContain('アバター未設定ルールを有効にしました。')
    expect(firstReply(reply).flags).toBe(MessageFlags.Ephemeral)
  })

  it('configures the account-age rule with timeout duration', async () => {
    const service = {
      configureAccountAge: vi.fn().mockResolvedValue({
        id: 2,
        ruleType: 'ACCOUNT_AGE',
        isEnabled: true,
        action: AutoModAction.TIMEOUT,
        thresholdSeconds: 30 * 60,
        timeoutDurationSeconds: 10 * 60
      })
    }
    const reply = createReplyMock()
    const command = createAutoModCommand(service as unknown as AutoModService)

    await command.execute({
      inCachedGuild: () => true,
      guildId: 'guild-1',
      guild: createGuildWithBotPermissions(PermissionFlagsBits.ModerateMembers),
      memberPermissions: createAdminPermissions(),
      options: {
        getSubcommandGroup: () => 'account-age',
        getSubcommand: () => 'set',
        getString: () => AutoModAction.TIMEOUT,
        getInteger: (name: string) => (name === 'minutes' ? 30 : 10)
      },
      reply
    } as unknown as ChatInputCommandInteraction)

    expect(service.configureAccountAge).toHaveBeenCalledWith({
      guildId: 'guild-1',
      thresholdSeconds: 30 * 60,
      action: AutoModAction.TIMEOUT,
      timeoutDurationSeconds: 10 * 60
    })
    expect(firstReply(reply).content).toContain('アカウント作成期間ルールを有効にしました。')
    expect(firstReply(reply).flags).toBe(MessageFlags.Ephemeral)
  })

  it('rejects rule setup when the bot lacks the required moderation permission', async () => {
    const service = {
      configureNoAvatar: vi.fn()
    }
    const reply = createReplyMock()
    const command = createAutoModCommand(service as unknown as AutoModService)

    await command.execute({
      inCachedGuild: () => true,
      guildId: 'guild-1',
      guild: createGuildWithBotPermissions(),
      memberPermissions: createAdminPermissions(),
      options: {
        getSubcommandGroup: () => 'no-avatar',
        getSubcommand: () => 'set',
        getString: () => AutoModAction.BAN,
        getInteger: () => null
      },
      reply
    } as unknown as ChatInputCommandInteraction)

    expect(service.configureNoAvatar).not.toHaveBeenCalled()
    expect(firstReply(reply).content).toBe('この設定には Bot に メンバーをBAN 権限が必要です。')
    expect(firstReply(reply).flags).toBe(MessageFlags.Ephemeral)
  })
})

function createReplyMock(): ReplyMock {
  return vi.fn<(payload: ReplyPayload) => void>()
}

function firstReply(reply: ReplyMock): ReplyPayload {
  const firstCall = reply.mock.calls[0]

  if (!firstCall) {
    throw new Error('reply was not called')
  }

  return firstCall[0]
}

function createAdminPermissions(): { has(permission: bigint): boolean } {
  return {
    has: (permission: bigint) => permission === PermissionFlagsBits.Administrator
  }
}

function createGuildWithBotPermissions(...allowedPermissions: bigint[]) {
  return {
    members: {
      fetchMe: vi.fn().mockResolvedValue({
        permissions: {
          has: (permission: bigint) => allowedPermissions.includes(permission)
        }
      }),
      me: null
    }
  }
}
