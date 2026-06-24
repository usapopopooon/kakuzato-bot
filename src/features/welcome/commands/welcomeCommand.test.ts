import { MessageFlags, PermissionFlagsBits, type ChatInputCommandInteraction } from 'discord.js'
import { describe, expect, it, vi } from 'vitest'
import type { WelcomeService } from '../services/welcomeService'
import { createWelcomeCommand } from './welcomeCommand'

describe('welcome command', () => {
  it('rejects non-admin users before changing config', async () => {
    const service = {
      setChannel: vi.fn()
    }
    const reply = vi.fn()
    const command = createWelcomeCommand(service as unknown as WelcomeService)

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
    const command = createWelcomeCommand(service as unknown as WelcomeService)

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
      content: 'welcome画像の送信先を <#channel-1> に設定しました。',
      flags: MessageFlags.Ephemeral
    })
  })

  it('rejects a channel when the bot cannot send files there', async () => {
    const service = {
      setChannel: vi.fn()
    }
    const reply = vi.fn()
    const command = createWelcomeCommand(service as unknown as WelcomeService)

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

  it('stores message content after the channel is configured', async () => {
    const service = {
      setMessage: vi.fn().mockResolvedValue({
        guildId: 'guild-1',
        channelId: 'channel-1',
        enabled: true,
        messageContent: 'ようこそ、{mention}!',
        bannerMessageTemplate: '{displayName} さんが召喚されました！',
        updatedAt: new Date().toISOString()
      })
    }
    const reply = vi.fn()
    const command = createWelcomeCommand(service as unknown as WelcomeService)

    await command.execute({
      inCachedGuild: () => true,
      guildId: 'guild-1',
      memberPermissions: {
        has: (permission: bigint) => permission === PermissionFlagsBits.Administrator
      },
      options: {
        getSubcommand: () => 'message',
        getString: () => 'ようこそ、{mention}!'
      },
      reply
    } as unknown as ChatInputCommandInteraction)

    expect(service.setMessage).toHaveBeenCalledWith('guild-1', 'ようこそ、{mention}!')
    expect(reply).toHaveBeenCalledWith({
      content: 'welcome本文を設定しました。\nようこそ、{mention}!',
      flags: MessageFlags.Ephemeral
    })
  })

  it('stores banner message content after the channel is configured', async () => {
    const service = {
      setBannerMessage: vi.fn().mockResolvedValue({
        guildId: 'guild-1',
        channelId: 'channel-1',
        enabled: true,
        messageContent: 'ようこそ、{mention}!',
        bannerMessageTemplate: '{displayName} さんが召喚されました！',
        updatedAt: new Date().toISOString()
      })
    }
    const reply = vi.fn()
    const command = createWelcomeCommand(service as unknown as WelcomeService)

    await command.execute({
      inCachedGuild: () => true,
      guildId: 'guild-1',
      memberPermissions: {
        has: (permission: bigint) => permission === PermissionFlagsBits.Administrator
      },
      options: {
        getSubcommand: () => 'banner-message',
        getString: () => '{displayName} さんが召喚されました！'
      },
      reply
    } as unknown as ChatInputCommandInteraction)

    expect(service.setBannerMessage).toHaveBeenCalledWith(
      'guild-1',
      '{displayName} さんが召喚されました！'
    )
    expect(reply).toHaveBeenCalledWith({
      content: 'welcome画像内メッセージを設定しました。\n{displayName} さんが召喚されました！',
      flags: MessageFlags.Ephemeral
    })
  })

  it('sends a test welcome through the configured service', async () => {
    const member = { id: 'user-1' }
    const service = {
      getConfig: vi.fn().mockResolvedValue({
        guildId: 'guild-1',
        channelId: 'channel-1',
        enabled: true,
        messageContent: 'Welcome, {mention}!',
        bannerMessageTemplate: '{displayName} さんが召喚されました！',
        updatedAt: new Date().toISOString()
      }),
      send: vi.fn().mockResolvedValue(true)
    }
    const deferReply = vi.fn().mockResolvedValue(undefined)
    const editReply = vi.fn().mockResolvedValue(undefined)
    const command = createWelcomeCommand(service as unknown as WelcomeService)

    await command.execute({
      inCachedGuild: () => true,
      guildId: 'guild-1',
      member,
      memberPermissions: {
        has: (permission: bigint) => permission === PermissionFlagsBits.Administrator
      },
      options: {
        getSubcommand: () => 'test'
      },
      deferReply,
      editReply
    } as unknown as ChatInputCommandInteraction)

    expect(deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral })
    expect(service.send).toHaveBeenCalledWith(member)
    expect(deferReply.mock.invocationCallOrder[0]).toBeLessThan(
      service.send.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY
    )
    expect(editReply).toHaveBeenCalledWith({
      content: 'welcomeのテスト投稿を送信しました。'
    })
  })
})
