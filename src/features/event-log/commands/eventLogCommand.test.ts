import { MessageFlags, PermissionFlagsBits, type ChatInputCommandInteraction } from 'discord.js'
import { describe, expect, it, vi } from 'vitest'
import type { EventLogService } from '../services/eventLogService'
import { createEventLogCommand } from './eventLogCommand'

describe('eventlog command', () => {
  it('rejects non-admin users before changing config', async () => {
    const service = {
      setChannel: vi.fn()
    }
    const reply = vi.fn()
    const command = createEventLogCommand(service as unknown as EventLogService)

    await command.execute({
      inCachedGuild: () => true,
      memberPermissions: { has: () => false },
      reply
    } as unknown as ChatInputCommandInteraction)

    expect(service.setChannel).not.toHaveBeenCalled()
    expect(reply).toHaveBeenCalledWith({
      content: 'このコマンドは管理者のみ実行できます。',
      flags: MessageFlags.Ephemeral
    })
  })

  it('stores the selected sendable channel from the set subcommand', async () => {
    const service = {
      setChannel: vi.fn().mockResolvedValue(undefined)
    }
    const fetchedChannel = { id: 'channel-1', send: vi.fn() }
    const reply = vi.fn()
    const command = createEventLogCommand(service as unknown as EventLogService)

    await command.execute({
      inCachedGuild: () => true,
      guildId: 'guild-1',
      guild: {
        channels: {
          fetch: vi.fn().mockResolvedValue(fetchedChannel)
        }
      },
      memberPermissions: {
        has: (permission: bigint) => permission === PermissionFlagsBits.Administrator
      },
      options: {
        getSubcommand: () => 'set',
        getChannel: () => ({ id: 'channel-1' })
      },
      reply
    } as unknown as ChatInputCommandInteraction)

    expect(service.setChannel).toHaveBeenCalledWith('guild-1', 'channel-1')
    expect(reply).toHaveBeenCalledWith({
      content: 'イベントログの送信先を <#channel-1> に設定しました。',
      flags: MessageFlags.Ephemeral
    })
  })

  it('rejects a channel when the bot cannot send embeds there', async () => {
    const service = {
      setChannel: vi.fn()
    }
    const reply = vi.fn()
    const command = createEventLogCommand(service as unknown as EventLogService)

    await command.execute({
      inCachedGuild: () => true,
      guildId: 'guild-1',
      guild: {
        channels: {
          fetch: vi.fn().mockResolvedValue({
            id: 'channel-1',
            send: vi.fn(),
            permissionsFor: vi.fn().mockReturnValue({ has: () => false })
          })
        }
      },
      client: { user: { id: 'bot-1' } },
      memberPermissions: {
        has: (permission: bigint) => permission === PermissionFlagsBits.Administrator
      },
      options: {
        getSubcommand: () => 'set',
        getChannel: () => ({ id: 'channel-1' })
      },
      reply
    } as unknown as ChatInputCommandInteraction)

    expect(service.setChannel).not.toHaveBeenCalled()
    expect(reply).toHaveBeenCalledWith({
      content: 'そのチャンネルに送信する権限が Bot にありません。',
      flags: MessageFlags.Ephemeral
    })
  })

  it('toggles an event log category', async () => {
    const service = {
      setCategory: vi.fn().mockResolvedValue({
        guildId: 'guild-1',
        channelId: 'channel-1',
        enabled: true,
        enabledCategories: ['message', 'member', 'moderation', 'server'],
        updatedAt: new Date().toISOString()
      })
    }
    const reply = vi.fn()
    const command = createEventLogCommand(service as unknown as EventLogService)

    await command.execute({
      inCachedGuild: () => true,
      guildId: 'guild-1',
      memberPermissions: {
        has: (permission: bigint) => permission === PermissionFlagsBits.Administrator
      },
      options: {
        getSubcommand: () => 'category',
        getString: () => 'voice',
        getBoolean: () => false
      },
      reply
    } as unknown as ChatInputCommandInteraction)

    expect(service.setCategory).toHaveBeenCalledWith('guild-1', 'voice', false)
    expect(reply).toHaveBeenCalledWith({
      content: 'ボイスログを無効にしました。',
      flags: MessageFlags.Ephemeral
    })
  })
})
