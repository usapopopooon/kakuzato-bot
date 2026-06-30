import { ChannelType, type Message } from 'discord.js'
import { describe, expect, it, vi } from 'vitest'
import type { AppLogger } from '../../../platform/logger/logger'
import type {
  AutoReactionConfig,
  AutoReactionRepository
} from '../repositories/autoReactionRepository'
import {
  isAutoReactionChannel,
  maxAutoReactionEmojis,
  parseAutoReactionEmojis,
  AutoReactionService
} from './autoReactionService'

describe('auto reaction service helpers', () => {
  it('parses unique reactions from spaces and commas', () => {
    expect(parseAutoReactionEmojis('👍, ❤️  👍 、 <:kaku:123>').emojis).toEqual([
      '👍',
      '❤️',
      '<:kaku:123>'
    ])
  })

  it('reports when too many reactions are provided', () => {
    const input = Array.from({ length: maxAutoReactionEmojis + 1 }, (_, index) => `e${index}`).join(
      ' '
    )
    const parsed = parseAutoReactionEmojis(input)

    expect(parsed.emojis).toContain('e0')
    expect(parsed.emojis).toContain('e19')
    expect(parsed.tooMany).toBe(true)
  })

  it('recognizes supported channel types', () => {
    expect(isAutoReactionChannel({ type: ChannelType.GuildText })).toBe(true)
    expect(isAutoReactionChannel({ type: ChannelType.GuildAnnouncement })).toBe(true)
    expect(isAutoReactionChannel({ type: ChannelType.GuildVoice })).toBe(false)
  })
})

describe('AutoReactionService', () => {
  it('adds all configured reactions when a member posts in the watched channel', async () => {
    const config = createConfig({ emojis: ['👍', '❤️'] })
    const react = vi.fn().mockResolvedValue(undefined)
    const repository = {
      get: vi.fn().mockResolvedValue(config)
    } as unknown as AutoReactionRepository
    const service = new AutoReactionService(repository, asLogger(createLoggerMock()))

    await service.handleMessage(createMessage({ react }))

    expect(react).toHaveBeenCalledWith('👍')
    expect(react).toHaveBeenCalledWith('❤️')
  })

  it('skips repository lookups for channels outside the loaded config cache', async () => {
    const get = vi.fn()
    const repository = {
      list: vi.fn().mockResolvedValue([createConfig()]),
      get
    } as unknown as AutoReactionRepository
    const service = new AutoReactionService(repository, asLogger(createLoggerMock()))
    await service.loadConfiguredChannels()

    await service.handleMessage(
      createMessage({
        channelId: 'channel-2'
      })
    )

    expect(get).not.toHaveBeenCalled()
  })

  it('continues and logs when adding a reaction fails', async () => {
    const config = createConfig({ emojis: ['ok', 'bad', 'next'] })
    const error = new Error('unknown emoji')
    const react = vi.fn((emoji: string) =>
      emoji === 'bad' ? Promise.reject(error) : Promise.resolve(undefined)
    )
    const repository = {
      get: vi.fn().mockResolvedValue(config)
    } as unknown as AutoReactionRepository
    const logger = createLoggerMock()
    const service = new AutoReactionService(repository, asLogger(logger))

    await service.handleMessage(createMessage({ react }))

    expect(react).toHaveBeenCalledWith('next')
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        error,
        guildId: 'guild-1',
        channelId: 'channel-1',
        emoji: 'bad'
      }),
      'Failed to add auto reaction'
    )
  })

  it('deletes configs by guild and updates the loaded cache', async () => {
    const deleteByGuild = vi.fn().mockResolvedValue(1)
    const get = vi.fn()
    const repository = {
      list: vi.fn().mockResolvedValue([createConfig()]),
      listByGuild: vi.fn().mockResolvedValue([createConfig()]),
      deleteByGuild,
      get
    } as unknown as AutoReactionRepository
    const service = new AutoReactionService(repository, asLogger(createLoggerMock()))
    await service.loadConfiguredChannels()

    await expect(service.deleteByGuild('guild-1')).resolves.toBe(1)
    await service.handleMessage(createMessage())

    expect(deleteByGuild).toHaveBeenCalledWith('guild-1')
    expect(get).not.toHaveBeenCalled()
  })
})

function createConfig(input: Partial<AutoReactionConfig> = {}): AutoReactionConfig {
  return {
    guildId: 'guild-1',
    channelId: 'channel-1',
    emojis: ['👍'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...input
  }
}

function createMessage(
  input: Partial<{ channelId: string; react: ReturnType<typeof vi.fn> }> = {}
) {
  return {
    id: 'message-1',
    guild: { id: 'guild-1' },
    channel: { id: input.channelId ?? 'channel-1' },
    author: { bot: false },
    react: input.react ?? vi.fn().mockResolvedValue(undefined)
  } as unknown as Message
}

type LoggerMock = {
  info: ReturnType<typeof vi.fn>
  warn: ReturnType<typeof vi.fn>
  error: ReturnType<typeof vi.fn>
  debug: ReturnType<typeof vi.fn>
}

function createLoggerMock(): LoggerMock {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}

function asLogger(logger: LoggerMock): AppLogger {
  return logger as unknown as AppLogger
}
