import { MessageFlags, type MessageComponentInteraction } from 'discord.js'
import { describe, expect, it, vi } from 'vitest'
import { noteCloseCustomId, type NoteService } from '../services/noteService'
import { createNoteComponentHandler } from './noteCommand'

describe('note component handler', () => {
  it('passes the source channel to close note controls', async () => {
    const member = { id: 'user-1' }
    const ensureCanUseNoteControls = vi.fn().mockResolvedValue(undefined)
    const close = vi.fn().mockResolvedValue('ノートを閉じました。')
    const service = {
      ensureCanUseNoteControls,
      close
    } as unknown as NoteService
    const deferReply = vi.fn().mockResolvedValue(undefined)
    const editReply = vi.fn().mockResolvedValue(undefined)
    const handler = createNoteComponentHandler(service)

    await handler.execute({
      inCachedGuild: () => true,
      isUserSelectMenu: () => false,
      isButton: () => true,
      customId: noteCloseCustomId,
      member,
      channelId: 'note-channel-1',
      deferReply,
      editReply
    } as unknown as MessageComponentInteraction)

    expect(ensureCanUseNoteControls).toHaveBeenCalledWith(member, 'note-channel-1')
    expect(close).toHaveBeenCalledWith(member, 'note-channel-1')
    expect(deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral })
    expect(editReply).toHaveBeenCalledWith({ content: 'ノートを閉じました。' })
  })
})
