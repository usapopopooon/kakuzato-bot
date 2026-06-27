import {
  MessageFlags,
  type MessageComponentInteraction,
  type ModalBuilder,
  type ModalSubmitInteraction
} from 'discord.js'
import { describe, expect, it, vi } from 'vitest'
import { noteCloseCustomId, noteEditTopicCustomId, type NoteService } from '../services/noteService'
import { createNoteComponentHandler, createNoteModalSubmitHandler } from './noteCommand'

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

  it('shows a topic edit modal from note controls', async () => {
    const member = { id: 'user-1' }
    const ensureCanUseNoteControls = vi.fn().mockResolvedValue(undefined)
    const service = {
      ensureCanUseNoteControls
    } as unknown as NoteService
    const showModal = vi.fn<(modal: ModalBuilder) => Promise<void>>().mockResolvedValue(undefined)
    const handler = createNoteComponentHandler(service)

    await handler.execute({
      inCachedGuild: () => true,
      isUserSelectMenu: () => false,
      isButton: () => true,
      customId: noteEditTopicCustomId,
      member,
      channelId: 'note-channel-1',
      showModal
    } as unknown as MessageComponentInteraction)

    expect(ensureCanUseNoteControls).toHaveBeenCalledWith(member, 'note-channel-1')
    expect(showModal).toHaveBeenCalledTimes(1)
    expect(showModal.mock.calls[0]?.[0]?.toJSON()).toMatchObject({
      custom_id: 'note-modal:topic',
      title: 'トピックを変更'
    })
  })
})

describe('note modal submit handler', () => {
  it('passes the source channel and requested topic to topic updates', async () => {
    const member = { id: 'user-1' }
    const updateTopic = vi
      .fn()
      .mockResolvedValue('チャンネルトピックを更新しました: <#note-channel-1>')
    const service = {
      updateTopic
    } as unknown as NoteService
    const deferReply = vi.fn().mockResolvedValue(undefined)
    const editReply = vi.fn().mockResolvedValue(undefined)
    const getTextInputValue = vi.fn().mockReturnValue('今日の作業ログ')
    const handler = createNoteModalSubmitHandler(service)

    await handler.execute({
      inCachedGuild: () => true,
      customId: 'note-modal:topic',
      member,
      channelId: 'note-channel-1',
      fields: {
        getTextInputValue
      },
      deferReply,
      editReply
    } as unknown as ModalSubmitInteraction)

    expect(deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral })
    expect(getTextInputValue).toHaveBeenCalledWith('note-topic-content')
    expect(updateTopic).toHaveBeenCalledWith(member, 'note-channel-1', '今日の作業ログ')
    expect(editReply).toHaveBeenCalledWith({
      content: 'チャンネルトピックを更新しました: <#note-channel-1>'
    })
  })
})
