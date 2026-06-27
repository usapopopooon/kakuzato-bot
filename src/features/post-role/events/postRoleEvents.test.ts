import { Events } from 'discord.js'
import { describe, expect, it, vi } from 'vitest'
import type { PostRoleService } from '../services/postRoleService'
import { createPostRoleEvents } from './postRoleEvents'

describe('postRoleEvents', () => {
  it('syncs history when the client becomes ready', async () => {
    const syncAll = vi.fn().mockResolvedValue(undefined)
    const service = {
      syncAll
    } as unknown as PostRoleService
    const client = { user: { tag: 'bot#0001' } }
    const event = createPostRoleEvents(service).find(
      (handler) => String(handler.name) === String(Events.ClientReady)
    )
    const execute = event?.execute as ((client: unknown) => Promise<void>) | undefined

    await execute?.(client)

    expect(syncAll).toHaveBeenCalledWith(client)
  })

  it('handles new messages', async () => {
    const handleMessage = vi.fn().mockResolvedValue(undefined)
    const service = {
      handleMessage
    } as unknown as PostRoleService
    const message = { id: 'message-1' }
    const event = createPostRoleEvents(service).find(
      (handler) => String(handler.name) === String(Events.MessageCreate)
    )
    const execute = event?.execute as ((message: unknown) => Promise<void>) | undefined

    await execute?.(message)

    expect(handleMessage).toHaveBeenCalledWith(message)
  })

  it('deletes configs when the assigned role is deleted', async () => {
    const deleteByRole = vi.fn().mockResolvedValue(1)
    const service = {
      deleteByRole
    } as unknown as PostRoleService
    const role = { id: 'role-1', guild: { id: 'guild-1' } }
    const event = createPostRoleEvents(service).find(
      (handler) => String(handler.name) === String(Events.GuildRoleDelete)
    )
    const execute = event?.execute as ((role: unknown) => Promise<void>) | undefined

    await execute?.(role)

    expect(deleteByRole).toHaveBeenCalledWith('guild-1', 'role-1')
  })
})
