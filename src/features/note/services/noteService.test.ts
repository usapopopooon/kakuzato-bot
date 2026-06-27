import { ChannelType, OverwriteType, type Guild, type GuildMember } from 'discord.js'
import { describe, expect, it, vi } from 'vitest'
import type { NoteChannel, NoteConfig, NoteRepository } from '../repositories/noteRepository'
import {
  createDefaultNoteChannelName,
  createNoteManagementActionRows,
  createNoteManagementPanelEmbed,
  createNoteLobbyPanelContent,
  createNoteLobbyPanelEmbed,
  NoteService,
  type NoteLobbyChannel,
  normalizeCustomNoteChannelName
} from './noteService'

describe('note service helpers', () => {
  it('normalizes requested note channel names for Discord text channels', () => {
    expect(normalizeCustomNoteChannelName('  My Note!!  ')).toBe('my-note')
    expect(normalizeCustomNoteChannelName('作業ログ その1')).toBe('作業ログ-その1')
    expect(normalizeCustomNoteChannelName('---')).toBeUndefined()
  })

  it('creates default note names from the display name', () => {
    expect(createDefaultNoteChannelName('note', 'うさぽ さん', '1234567890')).toBe(
      'うさぽ-さんのノート'
    )
    expect(createDefaultNoteChannelName('note', 'USAPO', '1234567890')).toBe('usapoのノート')
  })

  it('falls back when the display name has no usable channel name characters', () => {
    expect(createDefaultNoteChannelName('note', '!!!', '1234567890')).toBe('note-567890')
  })

  it('uses inviting and commentable wording in the lobby panel', () => {
    expect(createNoteLobbyPanelContent()).toContain('自分のノート')
    expect(createNoteLobbyPanelContent()).toContain('日記')
    expect(createNoteLobbyPanelContent()).toContain('最初は公開')
    expect(createNoteLobbyPanelContent()).toContain('コメント')
  })

  it('mentions the creator role in the lobby panel when configured', () => {
    expect(createNoteLobbyPanelContent({ creatorRoleId: 'role-1' })).toContain(
      '<@&role-1> を持っている人がノートを作れます。'
    )
  })

  it('renders the lobby panel as an embed', () => {
    const embed = createNoteLobbyPanelEmbed({ creatorRoleId: 'role-1' }).toJSON()

    expect(embed.title).toBe('ノート')
    expect(embed.description).toContain('自分のノート')
    expect(embed.description).toContain('<@&role-1> を持っている人がノートを作れます。')
  })

  it('omits creator role wording in the lobby panel when it is not configured', () => {
    expect(createNoteLobbyPanelContent()).not.toContain('ロール')
  })

  it('includes moderation actions in the note management panel', () => {
    const serializedRows = createNoteManagementActionRows().map((row) => row.toJSON())

    expect(JSON.stringify(serializedRows)).toContain('ユーザーをブロック')
    expect(JSON.stringify(serializedRows)).toContain('ブロック解除')
    expect(JSON.stringify(serializedRows)).toContain('閉じる')
  })

  it('renders the note management panel as an embed', () => {
    const member = createMember('guild-1', 'user-1', {})
    const embed = createNoteManagementPanelEmbed(member).toJSON()

    expect(embed.title).toBe('ノート操作')
    expect(embed.description).toContain('<@user-1> さんのノートです。')
    expect(embed.description).toContain('作成直後は公開・コメント可')
  })
})

describe('NoteService lobby panel', () => {
  it('posts the setup panel as an embed without allowed mentions', async () => {
    const config = { ...createNoteConfig(), creatorRoleId: 'role-1' }
    const { guild, lobbyChannel, send } = createLobbyPanelGuild(config)
    const updatePanelMessage = vi.fn().mockResolvedValue({ ...config, panelMessageId: 'message-2' })
    const repository = {
      setConfig: vi.fn().mockResolvedValue(config),
      updatePanelMessage
    } as unknown as NoteRepository
    const service = new NoteService(repository, createLoggerMock())

    await service.setup({
      guild,
      lobbyChannel,
      creatorRoleId: config.creatorRoleId
    })

    expect(send).toHaveBeenCalledTimes(1)
    const payload = send.mock.calls[0]?.[0] as LobbyPanelPayload
    expect(payload).not.toHaveProperty('content')
    expect(payload.allowedMentions).toEqual({ parse: [] })
    expect(payload.components).toHaveLength(1)
    expect(payload.embeds).toHaveLength(1)
    expect(payload.embeds?.[0]?.toJSON().description).toContain('<@&role-1>')
    expect(updatePanelMessage).toHaveBeenCalledWith(config.guildId, 'message-2')
  })

  it('reposts the lobby panel from stored config', async () => {
    const config = { ...createNoteConfig(), creatorRoleId: 'role-1' }
    const savedConfig = { ...config, panelMessageId: 'message-3' }
    const { guild, send, fetch } = createLobbyPanelGuild(config, 'message-3')
    const updatePanelMessage = vi.fn().mockResolvedValue(savedConfig)
    const repository = {
      getConfig: vi.fn().mockResolvedValue(config),
      updatePanelMessage
    } as unknown as NoteRepository
    const service = new NoteService(repository, createLoggerMock())

    await expect(service.repostLobbyPanel(guild)).resolves.toEqual(savedConfig)

    expect(fetch).toHaveBeenCalledWith(config.lobbyChannelId)
    expect(send).toHaveBeenCalledTimes(1)
    const payload = send.mock.calls[0]?.[0] as LobbyPanelPayload
    expect(payload.allowedMentions).toEqual({ parse: [] })
    expect(payload.embeds?.[0]?.toJSON().description).toContain('<@&role-1>')
    expect(updatePanelMessage).toHaveBeenCalledWith(config.guildId, 'message-3')
  })

  it('reposts the note management panel in the owner note', async () => {
    const note = createNoteChannel()
    const send = vi.fn().mockResolvedValue({ id: 'panel-1' })
    const textChannel = {
      id: note.channelId,
      type: ChannelType.GuildText,
      send
    }
    const fetch = vi.fn().mockResolvedValue(textChannel)
    const repository = {
      getNoteByUser: vi.fn().mockResolvedValue(note),
      deleteNoteByUser: vi.fn()
    } as unknown as NoteRepository
    const service = new NoteService(repository, createLoggerMock())
    const member = createMember(note.guildId, note.userId, {
      channels: { fetch }
    })

    await expect(service.repostManagementPanel(member)).resolves.toBe(
      `操作パネルを再投稿しました: <#${note.channelId}>`
    )

    expect(fetch).toHaveBeenCalledWith(note.channelId)
    expect(send).toHaveBeenCalledTimes(1)
    const payload = send.mock.calls[0]?.[0] as PanelPayload
    expect(payload).not.toHaveProperty('content')
    expect(payload.embeds).toHaveLength(1)
    expect(payload.embeds?.[0]?.toJSON().title).toBe('ノート操作')
    expect(payload.embeds?.[0]?.toJSON().description).toContain('<@user-1>')
    expect(payload.components).toHaveLength(2)
  })
})

describe('NoteService member leave archive', () => {
  it('archives an active note when its owner leaves the guild', async () => {
    const config = createNoteConfig()
    const note = createNoteChannel()
    const archiveCategory = { id: 'archive-1', type: ChannelType.GuildCategory }
    const permissionEdit = vi.fn().mockResolvedValue(undefined)
    const setParent = vi.fn().mockResolvedValue(undefined)
    const textChannel = {
      id: note.channelId,
      parentId: 'active-1',
      type: ChannelType.GuildText,
      setParent,
      permissionOverwrites: {
        edit: permissionEdit
      }
    }
    const guild = {
      id: config.guildId,
      roles: {
        everyone: { id: config.guildId }
      },
      members: {
        me: { id: 'bot-1' }
      },
      client: {
        user: { id: 'bot-1' }
      },
      channels: {
        cache: {
          size: 2,
          filter: vi.fn((predicate: (channel: { parentId?: string }) => boolean) => ({
            size: ([textChannel, archiveCategory] as { parentId?: string }[]).filter(predicate)
              .length
          }))
        },
        fetch: vi.fn((channelId?: string) => {
          if (!channelId) {
            return Promise.resolve(new Map())
          }

          if (channelId === note.channelId) {
            return Promise.resolve(textChannel)
          }

          if (channelId === archiveCategory.id) {
            return Promise.resolve(archiveCategory)
          }

          return Promise.resolve(null)
        }),
        create: vi.fn()
      }
    }
    const updateNoteState = vi.fn().mockResolvedValue({
      ...note,
      categoryId: archiveCategory.id,
      status: 'archived'
    })
    const repository = {
      getConfig: vi.fn().mockResolvedValue(config),
      getNoteByUser: vi.fn().mockResolvedValue(note),
      listCategories: vi.fn().mockResolvedValue([
        {
          id: 1,
          guildId: config.guildId,
          categoryId: archiveCategory.id,
          kind: 'archive',
          sortOrder: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ]),
      deleteCategory: vi.fn(),
      deleteNoteByUser: vi.fn(),
      updateNoteState
    } as unknown as NoteRepository
    const service = new NoteService(repository, createLoggerMock())
    const member = {
      id: note.userId,
      guild,
      user: { tag: 'note-owner#0001' }
    } as unknown as GuildMember

    await expect(service.archiveMemberNote(member)).resolves.toBe(true)

    expect(setParent).toHaveBeenCalledWith(archiveCategory.id, {
      lockPermissions: false,
      reason: 'Note archived because member left: note-owner#0001'
    })
    expect(permissionEdit).toHaveBeenCalledWith(
      note.userId,
      expect.objectContaining({ ViewChannel: false, SendMessages: false }),
      expect.objectContaining({ type: OverwriteType.Member })
    )
    expect(updateNoteState).toHaveBeenCalledTimes(1)
    const updateInput = updateNoteState.mock.calls[0]?.[2] as
      | { categoryId?: string; status?: string; archivedAt?: unknown }
      | undefined
    expect(updateNoteState.mock.calls[0]?.[0]).toBe(config.guildId)
    expect(updateNoteState.mock.calls[0]?.[1]).toBe(note.userId)
    expect(updateInput).toMatchObject({
      categoryId: archiveCategory.id,
      status: 'archived'
    })
    expect(typeof updateInput?.archivedAt).toBe('string')
  })

  it('does not archive when the member has no note', async () => {
    const config = createNoteConfig()
    const updateNoteState = vi.fn()
    const repository = {
      getConfig: vi.fn().mockResolvedValue(config),
      getNoteByUser: vi.fn().mockResolvedValue(undefined),
      updateNoteState
    } as unknown as NoteRepository
    const service = new NoteService(repository, createLoggerMock())
    const member = {
      id: 'user-1',
      guild: { id: config.guildId },
      user: { tag: 'note-owner#0001' }
    } as unknown as GuildMember

    await expect(service.archiveMemberNote(member)).resolves.toBe(false)

    expect(updateNoteState).not.toHaveBeenCalled()
  })

  it('deletes a stale note record only when the note channel is gone', async () => {
    const config = createNoteConfig()
    const note = createNoteChannel()
    const deleteNoteByUser = vi.fn().mockResolvedValue(true)
    const repository = {
      getConfig: vi.fn().mockResolvedValue(config),
      getNoteByUser: vi.fn().mockResolvedValue(note),
      deleteNoteByUser
    } as unknown as NoteRepository
    const service = new NoteService(repository, createLoggerMock())
    const member = createMember(config.guildId, note.userId, {
      channels: {
        fetch: vi.fn().mockRejectedValue(createDiscordError(10003))
      }
    })

    await expect(service.archiveMemberNote(member)).resolves.toBe(false)

    expect(deleteNoteByUser).toHaveBeenCalledWith(config.guildId, note.userId)
  })

  it('keeps the note record when fetching the note channel fails temporarily', async () => {
    const config = createNoteConfig()
    const note = createNoteChannel()
    const deleteNoteByUser = vi.fn()
    const updateNoteState = vi.fn()
    const repository = {
      getConfig: vi.fn().mockResolvedValue(config),
      getNoteByUser: vi.fn().mockResolvedValue(note),
      deleteNoteByUser,
      updateNoteState
    } as unknown as NoteRepository
    const service = new NoteService(repository, createLoggerMock())
    const member = createMember(config.guildId, note.userId, {
      channels: {
        fetch: vi.fn().mockRejectedValue(createDiscordError(50001))
      }
    })

    await expect(service.archiveMemberNote(member)).resolves.toBe(false)

    expect(deleteNoteByUser).not.toHaveBeenCalled()
    expect(updateNoteState).not.toHaveBeenCalled()
  })

  it('archives with fallback config when note setup has been disabled', async () => {
    const note = createNoteChannel()
    const archiveCategory = { id: 'archive-1', type: ChannelType.GuildCategory }
    const permissionEdit = vi.fn().mockResolvedValue(undefined)
    const setParent = vi.fn().mockResolvedValue(undefined)
    const textChannel = createTextChannel(note.channelId, setParent, permissionEdit)
    const guild = createGuildForArchive('guild-1', note, archiveCategory, textChannel)
    const updateNoteState = vi.fn().mockResolvedValue({
      ...note,
      categoryId: archiveCategory.id,
      status: 'archived'
    })
    const repository = {
      getConfig: vi.fn().mockResolvedValue(undefined),
      getNoteByUser: vi.fn().mockResolvedValue(note),
      listCategories: vi.fn().mockResolvedValue([
        createNoteCategory('guild-1', archiveCategory.id, 'archive')
      ]),
      deleteCategory: vi.fn(),
      deleteNoteByUser: vi.fn(),
      updateNoteState
    } as unknown as NoteRepository
    const service = new NoteService(repository, createLoggerMock())
    const member = createMember('guild-1', note.userId, guild)

    await expect(service.archiveMemberNote(member)).resolves.toBe(true)

    expect(setParent).toHaveBeenCalledWith(archiveCategory.id, {
      lockPermissions: false,
      reason: 'Note archived because member left: note-owner#0001'
    })
    expect(updateNoteState).toHaveBeenCalledWith(
      'guild-1',
      note.userId,
      expect.objectContaining({ categoryId: archiveCategory.id, status: 'archived' })
    )
  })

  it('rolls back Discord archive changes when saving the archived state fails', async () => {
    const config = createNoteConfig()
    const note = createNoteChannel()
    const archiveCategory = { id: 'archive-1', type: ChannelType.GuildCategory }
    const permissionEdit = vi.fn().mockResolvedValue(undefined)
    const setParent = vi.fn().mockResolvedValue(undefined)
    const textChannel = createTextChannel(note.channelId, setParent, permissionEdit)
    const guild = createGuildForArchive(config.guildId, note, archiveCategory, textChannel)
    const updateError = new Error('database unavailable')
    const updateNoteState = vi.fn().mockRejectedValue(updateError)
    const repository = {
      getConfig: vi.fn().mockResolvedValue(config),
      getNoteByUser: vi.fn().mockResolvedValue(note),
      listCategories: vi.fn().mockResolvedValue([
        createNoteCategory(config.guildId, archiveCategory.id, 'archive')
      ]),
      deleteCategory: vi.fn(),
      deleteNoteByUser: vi.fn(),
      updateNoteState
    } as unknown as NoteRepository
    const service = new NoteService(repository, createLoggerMock())
    const member = createMember(config.guildId, note.userId, guild)

    await expect(service.archiveMemberNote(member)).rejects.toBe(updateError)

    expect(setParent).toHaveBeenNthCalledWith(1, archiveCategory.id, {
      lockPermissions: false,
      reason: 'Note archived because member left: note-owner#0001'
    })
    expect(setParent).toHaveBeenNthCalledWith(2, note.categoryId, {
      lockPermissions: false,
      reason: 'Rollback Note archived because member left: note-owner#0001'
    })
    expect(permissionEdit).toHaveBeenCalledWith(
      note.userId,
      expect.objectContaining({ ViewChannel: true, SendMessages: true }),
      expect.objectContaining({ type: OverwriteType.Member })
    )
  })
})

function createNoteConfig(): NoteConfig {
  return {
    guildId: 'guild-1',
    lobbyChannelId: 'lobby-1',
    categoryBaseName: 'ノート',
    archiveCategoryBaseName: 'ノート Archive',
    channelNamePrefix: 'note',
    creatorRoleId: undefined,
    managerRoleId: undefined,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
}

function createNoteChannel(): NoteChannel {
  return {
    id: 1,
    guildId: 'guild-1',
    userId: 'user-1',
    channelId: 'channel-1',
    categoryId: 'active-1',
    status: 'active',
    visibility: 'public',
    commentMode: 'open',
    archivedAt: undefined,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
}

type LobbyPanelPayload = {
  embeds?: { toJSON(): { description?: string; title?: string } }[]
  allowedMentions?: { parse: string[] }
  components?: unknown[]
}

type PanelPayload = {
  embeds?: { toJSON(): { description?: string; title?: string } }[]
  components?: unknown[]
}

function createLobbyPanelGuild(config: NoteConfig, messageId = 'message-2') {
  const send = vi.fn().mockResolvedValue({ id: messageId })
  const permissionEdit = vi.fn().mockResolvedValue(undefined)
  const lobbyChannel = {
    id: config.lobbyChannelId,
    type: ChannelType.GuildText,
    send,
    permissionOverwrites: {
      edit: permissionEdit
    }
  }
  const fetch = vi.fn((channelId: string) =>
    Promise.resolve(channelId === config.lobbyChannelId ? lobbyChannel : null)
  )
  const guild = {
    id: config.guildId,
    roles: {
      everyone: { id: config.guildId }
    },
    channels: {
      fetch
    }
  }

  return {
    guild: guild as unknown as Guild,
    lobbyChannel: lobbyChannel as unknown as NoteLobbyChannel,
    send,
    fetch,
    permissionEdit
  }
}

function createNoteCategory(guildId: string, categoryId: string, kind: 'active' | 'archive') {
  return {
    id: 1,
    guildId,
    categoryId,
    kind,
    sortOrder: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
}

function createTextChannel(
  channelId: string,
  setParent: ReturnType<typeof vi.fn>,
  permissionEdit: ReturnType<typeof vi.fn>
) {
  return {
    id: channelId,
    parentId: 'active-1',
    type: ChannelType.GuildText,
    setParent,
    permissionOverwrites: {
      edit: permissionEdit
    }
  }
}

function createGuildForArchive(
  guildId: string,
  note: NoteChannel,
  archiveCategory: { id: string; type: ChannelType },
  textChannel: { id: string; parentId: string; type: ChannelType }
) {
  return {
    id: guildId,
    roles: {
      everyone: { id: guildId }
    },
    members: {
      me: { id: 'bot-1' }
    },
    client: {
      user: { id: 'bot-1' }
    },
    channels: {
      cache: {
        size: 2,
        filter: vi.fn((predicate: (channel: { parentId?: string }) => boolean) => ({
          size: ([textChannel, archiveCategory] as { parentId?: string }[]).filter(predicate)
            .length
        }))
      },
      fetch: vi.fn((channelId?: string) => {
        if (!channelId) {
          return Promise.resolve(new Map())
        }

        if (channelId === note.channelId) {
          return Promise.resolve(textChannel)
        }

        if (channelId === archiveCategory.id) {
          return Promise.resolve(archiveCategory)
        }

        return Promise.resolve(null)
      }),
      create: vi.fn()
    }
  }
}

function createMember(guildId: string, userId: string, guildOverrides: object): GuildMember {
  return {
    id: userId,
    guild: {
      id: guildId,
      ...guildOverrides
    },
    user: { tag: 'note-owner#0001' }
  } as unknown as GuildMember
}

function createDiscordError(code: number): Error & { code: number } {
  const error = new Error(`Discord API error ${code}`) as Error & { code: number }
  error.code = code
  return error
}

function createLoggerMock() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  } as never
}
