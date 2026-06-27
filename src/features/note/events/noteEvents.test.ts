import { Events } from 'discord.js'
import { describe, expect, it, vi } from 'vitest'
import type { NoteService } from '../services/noteService'
import { createNoteEvents } from './noteEvents'

describe('noteEvents', () => {
  it('archives a member note when the owner leaves the guild', async () => {
    const archiveMemberNote = vi.fn().mockResolvedValue(true)
    const service = {
      archiveMemberNote
    } as unknown as NoteService
    const member = { id: 'user-1' }
    const event = createNoteEvents(service).find(
      (handler) => String(handler.name) === String(Events.GuildMemberRemove)
    )
    const execute = event?.execute as ((member: unknown) => Promise<void>) | undefined

    await execute?.(member)

    expect(archiveMemberNote).toHaveBeenCalledWith(member)
  })
})
