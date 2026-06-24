import { Events } from 'discord.js'
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
})
