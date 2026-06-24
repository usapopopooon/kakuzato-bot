import type { Guild, GuildMember, VoiceState } from 'discord.js'
import { describe, expect, it, vi } from 'vitest'
import type { VoiceNotifyConfig } from '../repositories/voiceNotifyRepository'
import { createVoiceNotifyMessage, VoiceNotifyService } from './voiceNotifyService'

function createConfig(voiceChannelId: string, notifyChannelId: string, id = 1): VoiceNotifyConfig {
  return {
    id,
    guildId: 'guild-1',
    voiceChannelId,
    notifyChannelId,
    createdAt: new Date('2026-06-25T00:00:00.000Z').toISOString(),
    updatedAt: new Date('2026-06-25T00:00:00.000Z').toISOString()
  }
}

function createGuild(channels: Map<string, unknown>): Guild {
  return {
    id: 'guild-1',
    channels: {
      cache: channels,
      fetch: vi.fn((channelId: string) => Promise.resolve(channels.get(channelId) ?? null))
    }
  } as unknown as Guild
}

function createMember(displayName = 'ほげほげ', bot = false): GuildMember {
  return {
    displayName,
    user: {
      bot
    }
  } as unknown as GuildMember
}

function createState(
  guild: Guild,
  channelId: string | null,
  member: GuildMember | null
): VoiceState {
  return {
    guild,
    channelId,
    member
  } as unknown as VoiceState
}

function createService(configs: VoiceNotifyConfig[]) {
  const repository = {
    get: vi.fn(),
    listByGuild: vi.fn(),
    listByVoiceChannel: vi.fn((_guildId: string, voiceChannelId: string) =>
      Promise.resolve(configs.filter((config) => config.voiceChannelId === voiceChannelId))
    ),
    set: vi.fn(),
    delete: vi.fn(),
    deleteByGuild: vi.fn(),
    deleteByChannel: vi.fn()
  }
  const logger = {
    warn: vi.fn()
  }

  return {
    repository,
    logger,
    service: new VoiceNotifyService(repository as never, logger as never)
  }
}

describe('VoiceNotifyService', () => {
  it('sends a simple join notification for a watched voice channel', async () => {
    const send = vi.fn().mockResolvedValue(undefined)
    const guild = createGuild(new Map([['notify-1', { id: 'notify-1', send }]]))
    const member = createMember()
    const { service } = createService([createConfig('voice-1', 'notify-1')])

    await service.handleVoiceStateUpdate(
      createState(guild, null, null),
      createState(guild, 'voice-1', member)
    )

    expect(send).toHaveBeenCalledWith({
      content: 'ほげほげ さんが <#voice-1> に入室しました。',
      allowedMentions: { parse: [] }
    })
  })

  it('sends a simple leave notification for a watched voice channel', async () => {
    const send = vi.fn().mockResolvedValue(undefined)
    const guild = createGuild(new Map([['notify-1', { id: 'notify-1', send }]]))
    const member = createMember('ふがふが')
    const { service } = createService([createConfig('voice-1', 'notify-1')])

    await service.handleVoiceStateUpdate(
      createState(guild, 'voice-1', member),
      createState(guild, null, null)
    )

    expect(send).toHaveBeenCalledWith({
      content: 'ふがふが さんが <#voice-1> から退室しました。',
      allowedMentions: { parse: [] }
    })
  })

  it('sends leave and join notifications when moving between watched channels', async () => {
    const oldSend = vi.fn().mockResolvedValue(undefined)
    const newSend = vi.fn().mockResolvedValue(undefined)
    const guild = createGuild(
      new Map([
        ['notify-old', { id: 'notify-old', send: oldSend }],
        ['notify-new', { id: 'notify-new', send: newSend }]
      ])
    )
    const member = createMember('ほげほげ')
    const { service } = createService([
      createConfig('voice-old', 'notify-old', 1),
      createConfig('voice-new', 'notify-new', 2)
    ])

    await service.handleVoiceStateUpdate(
      createState(guild, 'voice-old', member),
      createState(guild, 'voice-new', member)
    )

    expect(oldSend).toHaveBeenCalledWith({
      content: 'ほげほげ さんが <#voice-old> から退室しました。',
      allowedMentions: { parse: [] }
    })
    expect(newSend).toHaveBeenCalledWith({
      content: 'ほげほげ さんが <#voice-new> に入室しました。',
      allowedMentions: { parse: [] }
    })
  })

  it('ignores bot users', async () => {
    const send = vi.fn().mockResolvedValue(undefined)
    const guild = createGuild(new Map([['notify-1', { id: 'notify-1', send }]]))
    const member = createMember('通知Bot', true)
    const { repository, service } = createService([createConfig('voice-1', 'notify-1')])

    await service.handleVoiceStateUpdate(
      createState(guild, null, null),
      createState(guild, 'voice-1', member)
    )

    expect(repository.listByVoiceChannel).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
  })

  it('escapes markdown in display names', () => {
    expect(
      createVoiceNotifyMessage(
        {
          displayName: 'foo_bar'
        },
        'voice-1',
        'join'
      )
    ).toBe('foo\\_bar さんが <#voice-1> に入室しました。')
  })
})
