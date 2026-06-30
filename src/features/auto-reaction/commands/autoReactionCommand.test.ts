import {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  type ChatInputCommandInteraction
} from 'discord.js'
import { describe, expect, it, vi } from 'vitest'
import type { AutoReactionService } from '../services/autoReactionService'
import { createAutoReactionCommand } from './autoReactionCommand'

describe('auto-reaction command', () => {
  it('rejects non-admin users before changing config', async () => {
    const service = {
      setConfig: vi.fn()
    }
    const reply = vi.fn()
    const command = createAutoReactionCommand(service as unknown as AutoReactionService)

    await command.execute({
      inCachedGuild: () => true,
      memberPermissions: { has: () => false },
      reply
    } as unknown as ChatInputCommandInteraction)

    expect(service.setConfig).not.toHaveBeenCalled()
    expect(reply).toHaveBeenCalledWith({
      content: 'このコマンドは管理者のみ実行できます。',
      flags: MessageFlags.Ephemeral
    })
  })

  it('stores setup config with parsed reactions', async () => {
    const service = {
      setConfig: vi.fn().mockResolvedValue({
        guildId: 'guild-1',
        channelId: 'channel-1',
        emojis: ['👍', '❤️'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })
    }
    const channel = createTextChannel()
    const reply = vi.fn()
    const command = createAutoReactionCommand(service as unknown as AutoReactionService)

    await command.execute(
      createInteraction({
        options: {
          getSubcommand: () => 'setup',
          getChannel: () => ({ id: 'channel-1' }),
          getString: () => '👍 ❤️ 👍'
        },
        guild: {
          channels: {
            fetch: vi.fn().mockResolvedValue(channel)
          }
        },
        reply
      })
    )

    expect(service.setConfig).toHaveBeenCalledWith({
      guildId: 'guild-1',
      channelId: 'channel-1',
      emojis: ['👍', '❤️']
    })
    const setupReply = reply.mock.calls[0]?.[0] as { content: string; flags: MessageFlags }
    expect(setupReply.content).toContain('自動リアクションを設定しました。')
    expect(setupReply.flags).toBe(MessageFlags.Ephemeral)
  })

  it('rejects setup when too many reactions are provided', async () => {
    const service = {
      setConfig: vi.fn()
    }
    const reply = vi.fn()
    const command = createAutoReactionCommand(service as unknown as AutoReactionService)

    await command.execute(
      createInteraction({
        options: {
          getSubcommand: () => 'setup',
          getChannel: () => ({ id: 'channel-1' }),
          getString: () => Array.from({ length: 21 }, (_, index) => `e${index}`).join(' ')
        },
        reply
      })
    )

    expect(service.setConfig).not.toHaveBeenCalled()
    expect(reply).toHaveBeenCalledWith({
      content: 'リアクションは最大 20 個まで指定できます。',
      flags: MessageFlags.Ephemeral
    })
  })

  it('rejects setup when the bot cannot add reactions in the channel', async () => {
    const service = {
      setConfig: vi.fn()
    }
    const channel = createTextChannel(false)
    const reply = vi.fn()
    const command = createAutoReactionCommand(service as unknown as AutoReactionService)

    await command.execute(
      createInteraction({
        options: {
          getSubcommand: () => 'setup',
          getChannel: () => ({ id: 'channel-1' }),
          getString: () => '👍'
        },
        guild: {
          channels: {
            fetch: vi.fn().mockResolvedValue(channel)
          }
        },
        reply
      })
    )

    expect(service.setConfig).not.toHaveBeenCalled()
    expect(reply).toHaveBeenCalledWith({
      content: '対象チャンネルで Bot にチャンネル閲覧とリアクション追加の権限がありません。',
      flags: MessageFlags.Ephemeral
    })
  })

  it('lists configured channels in status', async () => {
    const service = {
      listByGuild: vi.fn().mockResolvedValue([
        {
          guildId: 'guild-1',
          channelId: 'channel-1',
          emojis: ['👍'],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ])
    }
    const reply = vi.fn()
    const command = createAutoReactionCommand(service as unknown as AutoReactionService)

    await command.execute(
      createInteraction({
        options: {
          getSubcommand: () => 'status',
          getChannel: () => null
        },
        reply
      })
    )

    expect(service.listByGuild).toHaveBeenCalledWith('guild-1')
    const statusReply = reply.mock.calls[0]?.[0] as { content: string; flags: MessageFlags }
    expect(statusReply.content).toContain('自動リアクション設定:')
    expect(statusReply.flags).toBe(MessageFlags.Ephemeral)
  })
})

function createInteraction(input: {
  options: Record<string, unknown>
  guild?: Record<string, unknown>
  reply?: ReturnType<typeof vi.fn>
}): ChatInputCommandInteraction {
  return {
    inCachedGuild: () => true,
    guildId: 'guild-1',
    guild: {
      channels: {
        fetch: vi.fn().mockResolvedValue(createTextChannel())
      },
      ...input.guild
    },
    client: { user: { id: 'bot-1' } },
    memberPermissions: {
      has: (permission: bigint) => permission === PermissionFlagsBits.Administrator
    },
    options: input.options,
    reply: input.reply ?? vi.fn()
  } as unknown as ChatInputCommandInteraction
}

function createTextChannel(canReact = true) {
  return {
    id: 'channel-1',
    type: ChannelType.GuildText,
    permissionsFor: vi.fn().mockReturnValue({
      has: vi.fn().mockReturnValue(canReact)
    })
  }
}
