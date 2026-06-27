import {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  type ChatInputCommandInteraction
} from 'discord.js'
import { describe, expect, it, vi } from 'vitest'
import type { PostRoleService } from '../services/postRoleService'
import { createPostRoleCommand } from './postRoleCommand'

describe('post-role command', () => {
  it('rejects non-admin users before changing config', async () => {
    const service = {
      setConfig: vi.fn()
    }
    const reply = vi.fn()
    const command = createPostRoleCommand(service as unknown as PostRoleService)

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

  it('stores setup config and runs initial sync', async () => {
    const service = {
      setConfig: vi.fn().mockResolvedValue({
        guildId: 'guild-1',
        channelId: 'channel-1',
        roleId: 'role-1',
        historyLimit: 250,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }),
      syncChannel: vi.fn().mockResolvedValue({
        configs: 1,
        scannedMessages: 3,
        uniqueUsers: 2,
        assigned: 1,
        alreadyHad: 1,
        skippedBots: 0,
        skippedMissingMembers: 0,
        failed: 0
      })
    }
    const deferReply = vi.fn()
    const editReply = vi.fn()
    const channel = createHistoryChannel()
    const guild = {
      id: 'guild-1',
      channels: {
        fetch: vi.fn().mockResolvedValue(channel)
      },
      members: {
        me: {
          permissions: {
            has: (permission: bigint) => permission === PermissionFlagsBits.ManageRoles
          }
        }
      }
    }
    const command = createPostRoleCommand(service as unknown as PostRoleService)

    await command.execute({
      inCachedGuild: () => true,
      guildId: 'guild-1',
      guild,
      client: { user: { id: 'bot-1' } },
      memberPermissions: {
        has: (permission: bigint) => permission === PermissionFlagsBits.Administrator
      },
      options: {
        getSubcommand: () => 'setup',
        getChannel: () => ({ id: 'channel-1' }),
        getRole: () => ({
          id: 'role-1',
          managed: false,
          editable: true
        }),
        getInteger: () => 250
      },
      deferReply,
      editReply
    } as unknown as ChatInputCommandInteraction)

    expect(service.setConfig).toHaveBeenCalledWith({
      guildId: 'guild-1',
      channelId: 'channel-1',
      roleId: 'role-1',
      historyLimit: 250
    })
    expect(service.syncChannel).toHaveBeenCalledWith(guild, 'channel-1')
    expect(deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral })
    const setupEditPayload = editReply.mock.calls[0]?.[0] as unknown as
      | { content: string }
      | undefined
    expect(setupEditPayload?.content).toContain('初回同期結果:')
  })

  it('runs guild-wide sync when no channel is selected', async () => {
    const service = {
      syncGuild: vi.fn().mockResolvedValue({
        configs: 2,
        scannedMessages: 10,
        uniqueUsers: 4,
        assigned: 2,
        alreadyHad: 2,
        skippedBots: 0,
        skippedMissingMembers: 0,
        failed: 0
      })
    }
    const guild = { id: 'guild-1' }
    const deferReply = vi.fn()
    const editReply = vi.fn()
    const command = createPostRoleCommand(service as unknown as PostRoleService)

    await command.execute({
      inCachedGuild: () => true,
      guildId: 'guild-1',
      guild,
      memberPermissions: {
        has: (permission: bigint) => permission === PermissionFlagsBits.Administrator
      },
      options: {
        getSubcommand: () => 'sync',
        getChannel: () => null
      },
      deferReply,
      editReply
    } as unknown as ChatInputCommandInteraction)

    expect(service.syncGuild).toHaveBeenCalledWith(guild)
    const syncEditPayload = editReply.mock.calls[0]?.[0] as unknown as
      | { content: string }
      | undefined
    expect(syncEditPayload?.content).toContain('投稿実績ロールの履歴同期が完了しました。')
  })
})

function createHistoryChannel() {
  return {
    id: 'channel-1',
    type: ChannelType.GuildText,
    messages: {
      fetch: vi.fn()
    },
    permissionsFor: vi.fn().mockReturnValue({
      has: vi.fn().mockReturnValue(true)
    })
  }
}
