import type { Client, Guild, Message } from 'discord.js'
import { describe, expect, it, vi } from 'vitest'
import { disboardBotId, dissokuBotId, type BumpServiceKey } from '../bumpServices'
import {
  BumpService,
  detectBumpSuccess,
  type BumpHistoryChannel,
  type BumpMessageLike,
  type BumpSendableChannel
} from './bumpService'

type BumpSendOptions = Parameters<BumpSendableChannel['send']>[0]

function createMessage(input: BumpMessageLike): BumpMessageLike {
  return input
}

function createReminder(now: Date, overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    guildId: 'guild-1',
    channelId: 'channel-1',
    serviceKey: 'DISBOARD',
    remindAt: now.toISOString(),
    isEnabled: true,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    ...overrides
  }
}

function createHistoryMessage(input: {
  authorId: string
  createdAt: Date
  guild: Guild
  userId: string
  content?: string
  embeds?: BumpMessageLike['embeds']
}): Message {
  return {
    author: { id: input.authorId },
    content: input.content,
    embeds: input.embeds ?? [],
    createdAt: input.createdAt,
    createdTimestamp: input.createdAt.getTime(),
    guild: input.guild,
    interactionMetadata: {
      user: {
        id: input.userId
      }
    }
  } as unknown as Message
}

describe('bump detection', () => {
  it('detects DISBOARD success from embed description', () => {
    const message = createMessage({
      author: { id: disboardBotId },
      embeds: [
        {
          description: 'サーバーの表示順をアップしました！'
        }
      ]
    })

    expect(detectBumpSuccess(message)?.key).toBe('DISBOARD')
  })

  it('detects DISBOARD success from English embed text', () => {
    const message = createMessage({
      author: { id: disboardBotId },
      embeds: [
        {
          description: 'Bump done!'
        }
      ]
    })

    expect(detectBumpSuccess(message)?.key).toBe('DISBOARD')
  })

  it('detects ディス速報 success from embed title', () => {
    const message = createMessage({
      author: { id: dissokuBotId },
      embeds: [
        {
          title: 'サーバーをアップしたよ!'
        }
      ]
    })

    expect(detectBumpSuccess(message)?.key).toBe('DISSOKU')
  })

  it('detects ディス速報 success from embed fields', () => {
    const message = createMessage({
      author: { id: dissokuBotId },
      embeds: [
        {
          description: '<@12345>\nコマンド: `/up`',
          fields: [
            {
              name: 'アップしました!',
              value: '1時間後にまたupできます'
            }
          ]
        }
      ]
    })

    expect(detectBumpSuccess(message)?.key).toBe('DISSOKU')
  })

  it('detects ディス速報 success from content', () => {
    const message = createMessage({
      author: { id: dissokuBotId },
      content: 'CHILLカフェ をアップしたよ!'
    })

    expect(detectBumpSuccess(message)?.key).toBe('DISSOKU')
  })

  it('does not detect failure messages', () => {
    const message = createMessage({
      author: { id: dissokuBotId },
      embeds: [
        {
          fields: [
            {
              name: '失敗しました...',
              value: '間隔をあけてください'
            }
          ]
        }
      ]
    })

    expect(detectBumpSuccess(message)).toBeUndefined()
  })

  it('does not detect ディス速報 retry messages as success', () => {
    const message = createMessage({
      author: { id: dissokuBotId },
      embeds: [
        {
          title: 'まだアップできません',
          description: 'しばらく待ってからもう一度試してください。'
        }
      ]
    })

    expect(detectBumpSuccess(message)).toBeUndefined()
  })
})

describe('BumpService message handling', () => {
  it('sets a reminder for a bump user without requiring a Server Bumper role', async () => {
    const now = new Date('2026-06-24T12:00:00.000Z')
    const remindAt = new Date('2026-06-24T15:00:00.000Z')
    const dateNow = vi.spyOn(Date, 'now').mockReturnValue(now.getTime())
    const member = {
      id: 'user-1',
      roles: {
        cache: new Map()
      },
      toString: () => '<@user-1>'
    }
    const guild = {
      id: 'guild-1',
      roles: {
        cache: {
          get: vi.fn()
        }
      },
      members: {
        cache: new Map([['user-1', member]]),
        fetch: vi.fn()
      }
    } as unknown as Guild
    const send = vi.fn<BumpSendableChannel['send']>().mockResolvedValue({})
    const channel = {
      id: 'channel-1',
      send
    }
    const message = {
      author: { id: disboardBotId },
      channel,
      embeds: [{ description: 'サーバーの表示順をアップしました！' }],
      guild,
      interactionMetadata: {
        user: {
          id: 'user-1'
        }
      }
    } as unknown as Message
    const repository = {
      getConfig: vi.fn().mockResolvedValue({
        guildId: 'guild-1',
        channelId: 'channel-1',
        createdAt: now.toISOString(),
        updatedAt: now.toISOString()
      }),
      claimBumpDetection: vi
        .fn()
        .mockResolvedValue(createReminder(remindAt, { guildId: 'guild-1', channelId: 'channel-1' }))
    }
    const service = new BumpService(repository as never, { info: vi.fn(), warn: vi.fn() } as never)

    try {
      await service.handleMessage(message)
    } finally {
      dateNow.mockRestore()
    }

    expect(repository.claimBumpDetection).toHaveBeenCalledWith(
      'guild-1',
      'channel-1',
      'DISBOARD',
      remindAt
    )
    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0]?.[0].embeds?.[0]?.toJSON().description).toContain('<@user-1> さんが')
    expect(send.mock.calls[0]?.[0]).not.toHaveProperty('components')
  })

  it('sets a reminder when the bump user is only present as a mention', async () => {
    const now = new Date('2026-06-24T12:00:00.000Z')
    const remindAt = new Date('2026-06-24T14:00:00.000Z')
    const dateNow = vi.spyOn(Date, 'now').mockReturnValue(now.getTime())
    const guild = {
      id: 'guild-1',
      roles: {
        cache: {
          get: vi.fn()
        }
      },
      members: {
        cache: new Map(),
        fetch: vi.fn().mockRejectedValue(new Error('missing member'))
      }
    } as unknown as Guild
    const send = vi.fn<BumpSendableChannel['send']>().mockResolvedValue({})
    const channel = {
      id: 'channel-1',
      send
    }
    const message = {
      author: { id: dissokuBotId },
      channel,
      embeds: [{ description: '<@123456789012345678>\nアップしました!' }],
      guild
    } as unknown as Message
    const repository = {
      getConfig: vi.fn().mockResolvedValue({
        guildId: 'guild-1',
        channelId: 'channel-1',
        createdAt: now.toISOString(),
        updatedAt: now.toISOString()
      }),
      claimBumpDetection: vi.fn().mockResolvedValue(
        createReminder(remindAt, {
          guildId: 'guild-1',
          channelId: 'channel-1',
          serviceKey: 'DISSOKU'
        })
      )
    }
    const service = new BumpService(repository as never, { info: vi.fn(), warn: vi.fn() } as never)

    try {
      await service.handleMessage(message)
    } finally {
      dateNow.mockRestore()
    }

    expect(repository.claimBumpDetection).toHaveBeenCalledWith(
      'guild-1',
      'channel-1',
      'DISSOKU',
      remindAt
    )
    expect(send.mock.calls[0]?.[0].embeds?.[0]?.toJSON().description).toContain(
      '<@123456789012345678> さんが'
    )
  })
})

describe('BumpService reminders', () => {
  it('keeps a claimed reminder scheduled for retry when sending fails', async () => {
    const now = new Date('2026-06-24T12:00:00.000Z')
    const reminder = createReminder(now)
    const repository = {
      getDueReminders: vi.fn().mockResolvedValue([reminder]),
      claimDueReminder: vi.fn().mockResolvedValue(true),
      clearReminder: vi.fn()
    }
    const logger = {
      warn: vi.fn()
    }
    const channel = {
      id: 'channel-1',
      send: vi.fn().mockRejectedValue(new Error('send failed'))
    }
    const client = {
      channels: {
        cache: new Map([['channel-1', channel]]),
        fetch: vi.fn()
      }
    } as unknown as Client
    const service = new BumpService(repository as never, logger as never)

    await service.sendDueReminders(client, now)

    expect(repository.claimDueReminder).toHaveBeenCalledWith(
      1,
      now,
      new Date('2026-06-24T12:01:00.000Z')
    )
    expect(repository.clearReminder).not.toHaveBeenCalled()
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        guildId: 'guild-1',
        channelId: 'channel-1',
        serviceKey: 'DISBOARD',
        retryAt: '2026-06-24T12:01:00.000Z'
      }),
      'Failed to send bump reminder; it will be retried'
    )
  })

  it('sends reminders without a mention when no notification role is configured', async () => {
    const now = new Date('2026-06-24T12:00:00.000Z')
    const reminder = createReminder(now)
    const repository = {
      getDueReminders: vi.fn().mockResolvedValue([reminder]),
      claimDueReminder: vi.fn().mockResolvedValue(true),
      clearReminder: vi.fn().mockResolvedValue(true)
    }
    const channel = {
      id: 'channel-1',
      send: vi.fn().mockResolvedValue({})
    }
    const client = {
      channels: {
        cache: new Map([['channel-1', channel]]),
        fetch: vi.fn()
      }
    } as unknown as Client
    const service = new BumpService(repository as never, { info: vi.fn() } as never)

    await service.sendDueReminders(client, now)

    const sent = channel.send.mock.calls[0]?.[0] as BumpSendOptions | undefined
    expect(sent?.content).toBeUndefined()
    expect(sent?.allowedMentions).toEqual({ parse: [] })
    expect(sent).not.toHaveProperty('components')
    expect(repository.clearReminder).toHaveBeenCalled()
  })

  it('mentions only the configured notification role', async () => {
    const now = new Date('2026-06-24T12:00:00.000Z')
    const reminder = createReminder(now, { roleId: 'role-1' })
    const repository = {
      getDueReminders: vi.fn().mockResolvedValue([reminder]),
      claimDueReminder: vi.fn().mockResolvedValue(true),
      clearReminder: vi.fn().mockResolvedValue(true)
    }
    const channel = {
      id: 'channel-1',
      send: vi.fn().mockResolvedValue({})
    }
    const client = {
      channels: {
        cache: new Map([['channel-1', channel]]),
        fetch: vi.fn()
      }
    } as unknown as Client
    const service = new BumpService(repository as never, { info: vi.fn() } as never)

    await service.sendDueReminders(client, now)

    const sent = channel.send.mock.calls[0]?.[0] as BumpSendOptions | undefined
    expect(sent?.content).toBe('<@&role-1>')
    expect(sent?.allowedMentions).toEqual({ roles: ['role-1'], parse: [] })
    expect(sent).not.toHaveProperty('components')
    expect(repository.clearReminder).toHaveBeenCalled()
  })
})

describe('BumpService history sync', () => {
  it('posts one bump detection notification for each reminder synced from history', async () => {
    const now = new Date('2026-06-24T12:00:00.000Z')
    const member = {
      toString: () => '<@user-1>'
    }
    const guild = {
      id: 'guild-1',
      roles: {
        cache: {
          get: vi.fn()
        }
      },
      members: {
        cache: new Map([['user-1', member]]),
        fetch: vi.fn()
      }
    } as unknown as Guild
    const messages = new Map<string, Message>([
      [
        'disboard-message',
        createHistoryMessage({
          authorId: disboardBotId,
          createdAt: new Date('2026-06-24T11:00:00.000Z'),
          guild,
          userId: 'user-1',
          embeds: [{ description: 'サーバーの表示順をアップしました！' }]
        })
      ],
      [
        'dissoku-message',
        createHistoryMessage({
          authorId: dissokuBotId,
          createdAt: new Date('2026-06-24T10:45:00.000Z'),
          guild,
          userId: 'user-1',
          embeds: [{ title: 'サーバーをアップしたよ!' }]
        })
      ]
    ])
    const send = vi.fn<BumpSendableChannel['send']>().mockResolvedValue({})
    const channel = {
      id: 'channel-1',
      send,
      messages: {
        fetch: vi.fn().mockResolvedValue(messages)
      }
    } as unknown as BumpHistoryChannel
    const repository = {
      upsertReminder: vi.fn(
        (guildId: string, channelId: string, serviceKey: BumpServiceKey, remindAt: Date) =>
          Promise.resolve(createReminder(remindAt, { guildId, channelId, serviceKey }))
      )
    }
    const service = new BumpService(repository as never, { warn: vi.fn() } as never)

    const result = await service.syncFromHistory(guild, channel, now)

    expect(result.ok).toBe(true)
    expect(repository.upsertReminder).toHaveBeenCalledTimes(2)
    expect(send).toHaveBeenCalledTimes(2)
    const sent = send.mock.calls.map((call) => call[0])
    const firstEmbed = sent[0]?.embeds?.[0]?.toJSON()
    const secondEmbed = sent[1]?.embeds?.[0]?.toJSON()
    expect(firstEmbed?.title).toBe('Bump 検知')
    expect(firstEmbed?.description).toContain('次の bump リマインドは')
    expect(firstEmbed?.description).toContain('<@user-1> さんが')
    expect(sent[0]).not.toHaveProperty('components')
    expect(secondEmbed?.title).toBe('Bump 検知')
    expect(secondEmbed?.description).toContain('次の bump リマインドは')
    expect(sent[1]).not.toHaveProperty('components')
  })
})
