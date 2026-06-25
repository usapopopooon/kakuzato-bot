import {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  type ChatInputCommandInteraction
} from 'discord.js'
import { describe, expect, it, vi } from 'vitest'
import type { VoiceNotifyService } from '../services/voiceNotifyService'
import { createVoiceNotifyCommand } from './voiceNotifyCommand'

describe('voice-notify command', () => {
  it('rejects non-admin users before changing config', async () => {
    const service = {
      setConfig: vi.fn()
    }
    const reply = vi.fn()
    const command = createVoiceNotifyCommand(service as unknown as VoiceNotifyService)

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

  it('stores the watched voice channel and notification channel from add', async () => {
    const service = {
      setConfig: vi.fn().mockResolvedValue(undefined)
    }
    const reply = vi.fn()
    const command = createVoiceNotifyCommand(service as unknown as VoiceNotifyService)
    const voiceChannel = { id: 'voice-1', type: ChannelType.GuildVoice }
    const notifyChannel = {
      id: 'notify-1',
      type: ChannelType.GuildText,
      send: vi.fn(),
      permissionsFor: vi.fn().mockReturnValue({ has: () => true })
    }

    await command.execute({
      inCachedGuild: () => true,
      guildId: 'guild-1',
      guild: {
        channels: {
          fetch: vi.fn((channelId: string) =>
            Promise.resolve(channelId === 'voice-1' ? voiceChannel : notifyChannel)
          )
        }
      },
      client: { user: { id: 'bot-1' } },
      memberPermissions: {
        has: (permission: bigint) => permission === PermissionFlagsBits.Administrator
      },
      options: {
        getSubcommand: () => 'add',
        getChannel: (name: string) => ({ id: name === 'voice' ? 'voice-1' : 'notify-1' })
      },
      reply
    } as unknown as ChatInputCommandInteraction)

    expect(service.setConfig).toHaveBeenCalledWith('guild-1', 'voice-1', 'notify-1')
    expect(reply).toHaveBeenCalledWith({
      content: ['VC入退室通知を設定しました。', '監視VC: <#voice-1>', '通知先: <#notify-1>'].join(
        '\n'
      ),
      flags: MessageFlags.Ephemeral
    })
  })

  it('stores a watched category and notification channel from add-category', async () => {
    const service = {
      setCategoryConfig: vi.fn().mockResolvedValue(undefined)
    }
    const reply = vi.fn()
    const command = createVoiceNotifyCommand(service as unknown as VoiceNotifyService)
    const category = { id: 'category-1', type: ChannelType.GuildCategory }
    const notifyChannel = {
      id: 'notify-1',
      type: ChannelType.GuildText,
      send: vi.fn(),
      permissionsFor: vi.fn().mockReturnValue({ has: () => true })
    }

    await command.execute({
      inCachedGuild: () => true,
      guildId: 'guild-1',
      guild: {
        channels: {
          fetch: vi.fn((channelId: string) =>
            Promise.resolve(channelId === 'category-1' ? category : notifyChannel)
          )
        }
      },
      client: { user: { id: 'bot-1' } },
      memberPermissions: {
        has: (permission: bigint) => permission === PermissionFlagsBits.Administrator
      },
      options: {
        getSubcommand: () => 'add-category',
        getChannel: (name: string) => ({ id: name === 'category' ? 'category-1' : 'notify-1' })
      },
      reply
    } as unknown as ChatInputCommandInteraction)

    expect(service.setCategoryConfig).toHaveBeenCalledWith('guild-1', 'category-1', 'notify-1')
    expect(reply).toHaveBeenCalledWith({
      content: [
        'VCカテゴリ入退室通知を設定しました。',
        '監視カテゴリ: <#category-1>',
        '通知先: <#notify-1>'
      ].join('\n'),
      flags: MessageFlags.Ephemeral
    })
  })

  it('stores an excluded voice channel from exclude-add', async () => {
    const service = {
      addExclude: vi.fn().mockResolvedValue(undefined)
    }
    const reply = vi.fn()
    const command = createVoiceNotifyCommand(service as unknown as VoiceNotifyService)
    const voiceChannel = { id: 'voice-1', type: ChannelType.GuildVoice }

    await command.execute({
      inCachedGuild: () => true,
      guildId: 'guild-1',
      guild: {
        channels: {
          fetch: vi.fn(() => Promise.resolve(voiceChannel))
        }
      },
      memberPermissions: {
        has: (permission: bigint) => permission === PermissionFlagsBits.Administrator
      },
      options: {
        getSubcommand: () => 'exclude-add',
        getChannel: () => ({ id: 'voice-1' })
      },
      reply
    } as unknown as ChatInputCommandInteraction)

    expect(service.addExclude).toHaveBeenCalledWith('guild-1', 'voice-1')
    expect(reply).toHaveBeenCalledWith({
      content: 'カテゴリ通知の除外VCに追加しました。除外VC: <#voice-1>',
      flags: MessageFlags.Ephemeral
    })
  })

  it('shows configured watched voice channels in status', async () => {
    const service = {
      listConfigs: vi.fn().mockResolvedValue([
        {
          id: 1,
          guildId: 'guild-1',
          voiceChannelId: 'voice-1',
          notifyChannelId: 'notify-1',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ]),
      listCategoryConfigs: vi.fn().mockResolvedValue([
        {
          id: 2,
          guildId: 'guild-1',
          categoryId: 'category-1',
          notifyChannelId: 'notify-2',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ]),
      listExcludes: vi.fn().mockResolvedValue([
        {
          id: 3,
          guildId: 'guild-1',
          voiceChannelId: 'voice-excluded',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ])
    }
    const reply = vi.fn()
    const command = createVoiceNotifyCommand(service as unknown as VoiceNotifyService)

    await command.execute({
      inCachedGuild: () => true,
      guildId: 'guild-1',
      memberPermissions: {
        has: (permission: bigint) => permission === PermissionFlagsBits.Administrator
      },
      options: {
        getSubcommand: () => 'status'
      },
      reply
    } as unknown as ChatInputCommandInteraction)

    expect(reply).toHaveBeenCalledWith({
      content: [
        'VC入退室通知の設定:',
        '固定VC:',
        '・<#voice-1> -> <#notify-1>',
        'カテゴリ:',
        '・<#category-1> -> <#notify-2>',
        'カテゴリ通知の除外VC:',
        '・<#voice-excluded>'
      ].join('\n'),
      flags: MessageFlags.Ephemeral
    })
  })
})
