import type { GuildMember } from 'discord.js'
import { describe, expect, it, vi } from 'vitest'
import type { AppLogger } from '../../../platform/logger/logger'
import type { WelcomeConfigRepository } from '../repositories/welcomeConfigRepository'
import type { JoinBannerService } from './joinBannerService'
import { discordMessageMaxLength, WelcomeService } from './welcomeService'

describe('WelcomeService', () => {
  it("limits rendered message content to Discord's message length", async () => {
    const send = vi.fn().mockResolvedValue(undefined)
    const repository = {
      get: vi.fn().mockResolvedValue({
        guildId: 'guild-1',
        channelId: 'channel-1',
        enabled: true,
        messageContent: `${'a'.repeat(discordMessageMaxLength - 2)}🙂tail`,
        bannerMessageTemplate: '{displayName} さんが召喚されました！',
        updatedAt: new Date().toISOString()
      })
    }
    const bannerService = {
      create: vi.fn().mockResolvedValue(Buffer.from('image'))
    }
    const logger = {
      info: vi.fn(),
      warn: vi.fn()
    }
    const service = new WelcomeService(
      repository as unknown as WelcomeConfigRepository,
      bannerService as unknown as JoinBannerService,
      logger as unknown as AppLogger
    )
    const guild = {
      id: 'guild-1',
      name: 'Kakuzato',
      memberCount: 42,
      channels: {
        cache: new Map([['channel-1', { id: 'channel-1', send }]]),
        fetch: vi.fn()
      }
    }
    const member = {
      id: 'user-1',
      displayName: 'Alice',
      user: { username: 'alice' },
      guild,
      displayAvatarURL: () => undefined
    } as unknown as GuildMember

    await expect(service.send(member)).resolves.toBe(true)

    const options = send.mock.calls[0]?.[0] as { content: string }
    expect(options.content.length).toBeLessThanOrEqual(discordMessageMaxLength)
    expect(options.content.endsWith('...')).toBe(true)
    expect(bannerService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        headlineText: 'Alice さんが召喚されました！'
      })
    )
  })
})
