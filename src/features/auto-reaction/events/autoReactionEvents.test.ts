import { Events } from 'discord.js'
import { describe, expect, it, vi } from 'vitest'
import type { AutoReactionService } from '../services/autoReactionService'
import { createAutoReactionEvents } from './autoReactionEvents'

describe('autoReactionEvents', () => {
  it('loads configured channels when the client becomes ready', async () => {
    const loadConfiguredChannels = vi.fn().mockResolvedValue(undefined)
    const service = {
      loadConfiguredChannels
    } as unknown as AutoReactionService
    const event = createAutoReactionEvents(service).find(
      (handler) => String(handler.name) === String(Events.ClientReady)
    )
    const execute = event?.execute as (() => Promise<void>) | undefined

    await execute?.()

    expect(loadConfiguredChannels).toHaveBeenCalled()
  })

  it('handles new messages', async () => {
    const handleMessage = vi.fn().mockResolvedValue(undefined)
    const service = {
      handleMessage
    } as unknown as AutoReactionService
    const message = { id: 'message-1' }
    const event = createAutoReactionEvents(service).find(
      (handler) => String(handler.name) === String(Events.MessageCreate)
    )
    const execute = event?.execute as ((message: unknown) => Promise<void>) | undefined

    await execute?.(message)

    expect(handleMessage).toHaveBeenCalledWith(message)
  })

  it('removes configs when a configured channel is deleted', async () => {
    const remove = vi.fn().mockResolvedValue(true)
    const service = {
      remove
    } as unknown as AutoReactionService
    const channel = { id: 'channel-1' }
    const event = createAutoReactionEvents(service).find(
      (handler) => String(handler.name) === String(Events.ChannelDelete)
    )
    const execute = event?.execute as ((channel: unknown) => Promise<void>) | undefined

    await execute?.(channel)

    expect(remove).toHaveBeenCalledWith('channel-1')
  })
})
