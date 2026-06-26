import { Events, type EmbedBuilder } from 'discord.js'
import { describe, expect, it, vi } from 'vitest'
import { createEventLogEvents } from './eventLogEvents'
import type { EventLogService } from '../services/eventLogService'

describe('eventLogEvents', () => {
  it('logs edited messages even when the updated message author is unavailable', async () => {
    const service = {
      send: vi.fn().mockResolvedValue(true)
    }
    const messageUpdateEventName = Events.MessageUpdate as string
    const event = createEventLogEvents(service as unknown as EventLogService).find(
      (handler) => String(handler.name) === messageUpdateEventName
    )
    const execute = event?.execute as
      | ((before: unknown, after: unknown) => Promise<void>)
      | undefined
    const guild = { id: 'guild-1' }
    const channel = { id: 'channel-1', toString: () => '<#channel-1>' }

    await execute?.(
      {
        attachments: new Map(),
        author: null,
        channel,
        content: 'before',
        createdTimestamp: Date.now(),
        id: 'message-1'
      },
      {
        attachments: new Map(),
        author: null,
        channel,
        content: 'after',
        createdTimestamp: Date.now(),
        editedTimestamp: Date.now(),
        guild,
        id: 'message-1'
      }
    )

    expect(service.send).toHaveBeenCalledWith(guild, 'message', expect.anything())
  })

  it('logs the invite used for a member join when invite uses increase', async () => {
    const service = {
      send: vi.fn().mockResolvedValue(true)
    }
    const inviteFetch = vi
      .fn()
      .mockResolvedValueOnce(new Map([['abc123', createInviteFixture('abc123', 3, 'user-1')]]))
      .mockResolvedValueOnce(new Map([['abc123', createInviteFixture('abc123', 4, 'user-1')]]))
    const guild = {
      id: 'guild-1',
      fetchVanityData: vi.fn(),
      invites: { fetch: inviteFetch },
      memberCount: 42
    }
    const handlers = createEventLogEvents(service as unknown as EventLogService)
    const ready = handlers.find((handler) => String(handler.name) === String(Events.ClientReady))
      ?.execute as ((client: unknown) => Promise<void>) | undefined
    const memberJoin = handlers.find(
      (handler) => String(handler.name) === String(Events.GuildMemberAdd)
    )?.execute as ((member: unknown) => Promise<void>) | undefined

    await ready?.({ guilds: { cache: new Map([[guild.id, guild]]) } })
    await memberJoin?.({
      displayAvatarURL: () => 'https://example.com/avatar.png',
      guild,
      joinedTimestamp: Date.parse('2026-06-24T03:00:00.000Z'),
      user: {
        bot: false,
        createdTimestamp: Date.parse('2026-06-01T00:00:00.000Z'),
        id: 'user-2',
        tag: 'new-user#0001',
        toString: () => '<@user-2>'
      }
    })

    const sentCall = service.send.mock.calls[0] as [unknown, unknown, EmbedBuilder] | undefined
    const fields = sentCall?.[2].toJSON().fields ?? []
    expect(service.send).toHaveBeenCalledWith(guild, 'member', expect.anything())
    expect(fields.find((field: { name: string }) => field.name === '招待コード')?.value).toBe(
      '`abc123`'
    )
    expect(fields.find((field: { name: string }) => field.name === '招待作成者')?.value).toContain(
      '<@user-1>'
    )
  })
})

function createInviteFixture(code: string, uses: number, inviterId: string) {
  return {
    code,
    inviter: {
      id: inviterId
    },
    uses
  }
}
