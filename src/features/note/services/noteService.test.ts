import {
  ChannelType,
  OverwriteType,
  PermissionFlagsBits,
  type Guild,
  type GuildMember
} from 'discord.js'
import { describe, expect, it, vi } from 'vitest'
import type { NoteChannel, NoteConfig, NoteRepository } from '../repositories/noteRepository'
import {
  createDefaultNoteChannelName,
  createNoteManagementActionRows,
  createNoteManagementPanelEmbed,
  createNoteLobbyActionRows,
  createNoteLobbyPanelContent,
  createNoteLobbyPanelEmbed,
  defaultNotePanelRefreshHistoryLimit,
  NoteService,
  normalizeNotePanelRefreshHistoryLimit,
  normalizeNoteTopic,
  noteToggleVisibilityCustomId,
  type NoteLobbyChannel,
  normalizeCustomNoteChannelName
} from './noteService'

describe('note service helpers', () => {
  it('keeps requested note channel names mostly intact', () => {
    expect(normalizeCustomNoteChannelName('  My Note!! 📝  ')).toBe('My Note!! 📝')
    expect(normalizeCustomNoteChannelName('作業ログ その1🐰')).toBe('作業ログ その1🐰')
    expect(normalizeCustomNoteChannelName('---')).toBe('---')
    expect(normalizeCustomNoteChannelName('   ')).toBeUndefined()
  })

  it('creates default note names from the display name', () => {
    expect(createDefaultNoteChannelName('note', 'うさぽ さん🐰', '1234567890')).toBe(
      'うさぽ さん🐰のノート'
    )
    expect(createDefaultNoteChannelName('note', 'USAPO', '1234567890')).toBe('USAPOのノート')
  })

  it('falls back when the display name is blank', () => {
    expect(createDefaultNoteChannelName('note', '   ', '1234567890')).toBe('note-567890')
  })

  it('normalizes note panel refresh history limits', () => {
    expect(normalizeNotePanelRefreshHistoryLimit(undefined)).toBe(
      defaultNotePanelRefreshHistoryLimit
    )
    expect(normalizeNotePanelRefreshHistoryLimit(0)).toBe(1)
    expect(normalizeNotePanelRefreshHistoryLimit(1001)).toBe(1000)
  })

  it('normalizes requested note topics', () => {
    expect(normalizeNoteTopic('  今日の作業ログ  ')).toBe('今日の作業ログ')
    expect(normalizeNoteTopic('   ')).toBeUndefined()
    expect(normalizeNoteTopic('a'.repeat(1025))).toHaveLength(1024)
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

  it('separates lobby panel sections with blank lines', () => {
    const content = createNoteLobbyPanelContent({ creatorRoleId: 'role-1' })

    expect(content).toContain('自分のノートをひとつ持てます。\n\n日記')
    expect(content).toContain('コメントできます。\n\n<@&role-1>')
    expect(content).toContain('作れます。\n\n操作パネル')
  })

  it('explains member note command hints in the lobby panel', () => {
    const content = createNoteLobbyPanelContent()

    expect(content).toContain('操作パネルは、自分のノートチャンネルに再投稿できます。')
    expect(content).toContain('閉じたノート')
    expect(content).toContain('ロビーから復元')
    expect(content).toContain('公開設定、コメント設定、ブロック、閉じる操作')
    expect(content).not.toContain('ロビーのボタンでできること')
  })

  it('uses an owner-scoped label for reposting the management panel', () => {
    const serializedRows = createNoteLobbyActionRows().map((row) => row.toJSON())

    expect(JSON.stringify(serializedRows)).toContain('自分の操作パネルを再投稿')
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
    expect(JSON.stringify(serializedRows)).toContain('このパネルを削除')
    expect(JSON.stringify(serializedRows)).toContain('トピック変更')
    expect(JSON.stringify(serializedRows)).toContain('閉じる')
  })

  it('renders the note management panel as an embed', () => {
    const member = createMember('guild-1', 'user-1', {})
    const embed = createNoteManagementPanelEmbed(member).toJSON()

    expect(embed.title).toBe('ノート操作')
    expect(embed.description).toContain('<@user-1> さんのノートです。')
    expect(embed.description).toContain('作成直後は公開・コメント可')
    expect(embed.description).toContain('ロビーからこのノートに再投稿')
    expect(embed.description).toContain('このパネルのボタンで削除')
    expect(embed.description).toContain('閉じたノートはロビーから復元')
    expect(embed.description).not.toContain('このパネルでできること')
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

  it('reposts the note management panel in the owner note with a user mention', async () => {
    const note = createNoteChannel()
    const send = vi.fn().mockResolvedValue({ id: 'panel-1' })
    const textChannel = {
      id: note.channelId,
      type: ChannelType.GuildText,
      send
    }
    const fetch = vi.fn().mockResolvedValue(textChannel)
    const updateManagementPanelMessage = vi.fn()
    const repository = {
      getNoteByUser: vi.fn().mockResolvedValue(note),
      deleteNoteByUser: vi.fn(),
      updateManagementPanelMessage
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
    const payload = send.mock.calls[0]?.[0] as ManagementPanelPayload
    expect(payload.content).toBe('<@user-1>')
    expect(payload.allowedMentions).toEqual({ users: ['user-1'] })
    expect(payload.embeds).toHaveLength(1)
    expect(payload.embeds?.[0]?.toJSON().title).toBe('ノート操作')
    expect(payload.embeds?.[0]?.toJSON().description).toContain('<@user-1>')
    expect(payload.components).toHaveLength(2)
    expect(updateManagementPanelMessage).toHaveBeenCalledWith(note.guildId, note.userId, 'panel-1')
  })

  it('disables here and everyone mentions when creating a note channel', async () => {
    const config = { ...createNoteConfig(), managerRoleId: 'manager-1' }
    const category = { id: 'active-1', type: ChannelType.GuildCategory }
    const send = vi.fn().mockResolvedValue({ id: 'panel-1' })
    const createdChannel = {
      id: 'created-note-1',
      type: ChannelType.GuildText,
      send
    }
    const channelsCreate = vi.fn().mockResolvedValue(createdChannel)
    const guild = createGuildForNoteCreation(config, category, channelsCreate)
    const repository = {
      getConfig: vi.fn().mockResolvedValue(config),
      getNoteByUser: vi.fn().mockResolvedValue(undefined),
      listCategories: vi
        .fn()
        .mockResolvedValue([createNoteCategory(config.guildId, category.id, 'active')]),
      deleteCategory: vi.fn(),
      createNote: vi.fn().mockResolvedValue(createNoteChannel()),
      updateManagementPanelMessage: vi.fn()
    } as unknown as NoteRepository
    const service = new NoteService(repository, createLoggerMock())
    const member = createMember(config.guildId, 'user-1', guild)

    await expect(service.openOrCreate(member)).resolves.toBe(
      `ノートを作成しました: <#${createdChannel.id}>`
    )

    const payload = channelsCreate.mock.calls[0]?.[0] as ChannelCreatePayload | undefined
    const overwrites = payload?.permissionOverwrites ?? []

    expect(findOverwrite(overwrites, config.guildId)?.deny).toContain(
      PermissionFlagsBits.MentionEveryone
    )
    expect(findOverwrite(overwrites, member.id)?.deny).toContain(
      PermissionFlagsBits.MentionEveryone
    )
    expect(findOverwrite(overwrites, 'bot-1')?.deny).toContain(PermissionFlagsBits.MentionEveryone)
    expect(findOverwrite(overwrites, config.managerRoleId)?.deny).toContain(
      PermissionFlagsBits.MentionEveryone
    )
  })

  it('edits stored note management panels during refresh', async () => {
    const note = { ...createNoteChannel(), managementPanelMessageId: 'old-panel-1' }
    const edit = vi.fn().mockResolvedValue(undefined)
    const oldPanel = createManagementPanelMessage(
      'old-panel-1',
      [noteToggleVisibilityCustomId],
      edit
    )
    const messagesFetch = vi.fn().mockResolvedValue(oldPanel)
    const textChannel = createTextChannelWithMessages(note.channelId, messagesFetch, vi.fn())
    const member = createMember(note.guildId, note.userId, {})
    const guild = createGuildForPanelRefresh(note, textChannel, member)
    const updateManagementPanelMessage = vi.fn().mockResolvedValue(note)
    const repository = {
      listNotes: vi.fn().mockResolvedValue([note]),
      deleteNoteByUser: vi.fn(),
      updateManagementPanelMessage
    } as unknown as NoteRepository
    const service = new NoteService(repository, createLoggerMock())

    await expect(service.refreshManagementPanels(guild, 50)).resolves.toEqual({
      total: 1,
      updated: 1,
      skipped: 0,
      failed: 0
    })

    expect(messagesFetch).toHaveBeenCalledWith('old-panel-1')
    expect(edit).toHaveBeenCalledTimes(1)
    const payload = edit.mock.calls[0]?.[0] as ManagementPanelPayload
    expect(payload.content).toBe('<@user-1>')
    expect(payload.allowedMentions).toEqual({ users: ['user-1'] })
    expect(payload.embeds?.[0]?.toJSON().title).toBe('ノート操作')
    expect(payload.components).toHaveLength(2)
    expect(updateManagementPanelMessage).toHaveBeenCalledWith(
      note.guildId,
      note.userId,
      'old-panel-1'
    )
  })

  it('edits note management panels found in message history during refresh', async () => {
    const note = createNoteChannel()
    const edit = vi.fn().mockResolvedValue(undefined)
    const oldPanel = createManagementPanelMessage(
      'history-panel-1',
      [noteToggleVisibilityCustomId],
      edit
    )
    const messagesFetch = vi.fn().mockResolvedValue(new Map([['history-panel-1', oldPanel]]))
    const send = vi.fn()
    const textChannel = createTextChannelWithMessages(note.channelId, messagesFetch, send)
    const member = createMember(note.guildId, note.userId, {})
    const guild = createGuildForPanelRefresh(note, textChannel, member)
    const updateManagementPanelMessage = vi.fn().mockResolvedValue(note)
    const repository = {
      listNotes: vi.fn().mockResolvedValue([note]),
      deleteNoteByUser: vi.fn(),
      updateManagementPanelMessage
    } as unknown as NoteRepository
    const service = new NoteService(repository, createLoggerMock())

    await expect(service.refreshManagementPanels(guild, 50)).resolves.toEqual({
      total: 1,
      updated: 1,
      skipped: 0,
      failed: 0
    })

    expect(messagesFetch).toHaveBeenCalledWith({ limit: 50, before: undefined, cache: false })
    expect(edit).toHaveBeenCalledTimes(1)
    expect(send).not.toHaveBeenCalled()
    expect(updateManagementPanelMessage).toHaveBeenCalledWith(
      note.guildId,
      note.userId,
      'history-panel-1'
    )
  })

  it('edits stored note management panels without user mentions when requested', async () => {
    const note = { ...createNoteChannel(), managementPanelMessageId: 'old-panel-1' }
    const edit = vi.fn().mockResolvedValue(undefined)
    const oldPanel = createManagementPanelMessage(
      'old-panel-1',
      [noteToggleVisibilityCustomId],
      edit
    )
    const messagesFetch = vi.fn().mockResolvedValue(oldPanel)
    const textChannel = createTextChannelWithMessages(note.channelId, messagesFetch, vi.fn())
    const member = createMember(note.guildId, note.userId, {})
    const guild = createGuildForPanelRefresh(note, textChannel, member)
    const updateManagementPanelMessage = vi.fn().mockResolvedValue(note)
    const repository = {
      listNotes: vi.fn().mockResolvedValue([note]),
      deleteNoteByUser: vi.fn(),
      updateManagementPanelMessage
    } as unknown as NoteRepository
    const service = new NoteService(repository, createLoggerMock())

    await expect(
      service.refreshManagementPanels(guild, 50, { removeMention: true })
    ).resolves.toEqual({
      total: 1,
      updated: 1,
      skipped: 0,
      failed: 0
    })

    const payload = edit.mock.calls[0]?.[0] as ManagementPanelPayload
    expect(payload.content).toBe('')
    expect(payload.allowedMentions).toEqual({ parse: [] })
    expect(payload.embeds?.[0]?.toJSON().description).toContain('<@user-1> さんのノートです。')
  })

  it('skips refresh without posting when no old management panel is found', async () => {
    const note = createNoteChannel()
    const send = vi.fn().mockResolvedValue({ id: 'new-panel-1' })
    const messagesFetch = vi.fn().mockResolvedValue(new Map())
    const textChannel = createTextChannelWithMessages(note.channelId, messagesFetch, send)
    const member = createMember(note.guildId, note.userId, {})
    const guild = createGuildForPanelRefresh(note, textChannel, member)
    const updateManagementPanelMessage = vi.fn().mockResolvedValue(note)
    const repository = {
      listNotes: vi.fn().mockResolvedValue([note]),
      deleteNoteByUser: vi.fn(),
      updateManagementPanelMessage
    } as unknown as NoteRepository
    const service = new NoteService(repository, createLoggerMock())

    await expect(service.refreshManagementPanels(guild, 50)).resolves.toEqual({
      total: 1,
      updated: 0,
      skipped: 1,
      failed: 0
    })

    expect(messagesFetch).toHaveBeenCalledWith({ limit: 50, before: undefined, cache: false })
    expect(send).not.toHaveBeenCalled()
    expect(updateManagementPanelMessage).not.toHaveBeenCalled()
  })

  it('uses the owner note for block operations invoked from the lobby panel', async () => {
    const config = createNoteConfig()
    const note = createNoteChannel()
    const permissionEdit = vi.fn().mockResolvedValue(undefined)
    const textChannel = createTextChannel(note.channelId, vi.fn(), permissionEdit)
    const repository = {
      getConfig: vi.fn().mockResolvedValue(config),
      getNoteByChannel: vi.fn().mockResolvedValue(undefined),
      getNoteByUser: vi.fn().mockResolvedValue(note),
      deleteNoteByUser: vi.fn()
    } as unknown as NoteRepository
    const service = new NoteService(repository, createLoggerMock())
    const member = createMember(note.guildId, note.userId, {
      members: {
        me: { id: 'bot-1' },
        fetch: vi.fn().mockResolvedValue({
          permissions: { has: vi.fn().mockReturnValue(false) },
          roles: { cache: { has: vi.fn().mockReturnValue(false) } }
        })
      },
      client: { user: { id: 'bot-1' } },
      channels: {
        fetch: vi.fn().mockResolvedValue(textChannel)
      }
    })

    await expect(service.blockUser(member, config.lobbyChannelId, 'target-1')).resolves.toBe(
      '<@target-1> をこのノートからブロックしました。'
    )

    expect(permissionEdit).toHaveBeenCalledWith(
      'target-1',
      expect.objectContaining({ ViewChannel: false, SendMessages: false }),
      expect.objectContaining({ reason: `Note user blocked by ${member.user.tag}` })
    )
  })

  it('loads current note edit defaults from a note control channel', async () => {
    const note = createNoteChannel()
    const textChannel = {
      ...createTextChannel(note.channelId, vi.fn(), vi.fn()),
      name: '作業ログ',
      topic: '今日の作業ログ'
    }
    const repository = {
      getNoteByChannel: vi.fn().mockResolvedValue(note),
      deleteNoteByUser: vi.fn()
    } as unknown as NoteRepository
    const service = new NoteService(repository, createLoggerMock())
    const member = createMember(note.guildId, note.userId, {
      channels: {
        fetch: vi.fn().mockResolvedValue(textChannel)
      }
    })

    await expect(service.getNoteEditDefaults(member, note.channelId)).resolves.toEqual({
      name: '作業ログ',
      topic: '今日の作業ログ'
    })
  })

  it('loads current note edit defaults from the owner note when invoked from the lobby', async () => {
    const note = createNoteChannel()
    const textChannel = {
      ...createTextChannel(note.channelId, vi.fn(), vi.fn()),
      name: '自分のノート',
      topic: null
    }
    const fetch = vi.fn().mockResolvedValue(textChannel)
    const repository = {
      getNoteByChannel: vi.fn().mockResolvedValue(undefined),
      getNoteByUser: vi.fn().mockResolvedValue(note),
      deleteNoteByUser: vi.fn()
    } as unknown as NoteRepository
    const service = new NoteService(repository, createLoggerMock())
    const member = createMember(note.guildId, note.userId, {
      channels: { fetch }
    })

    await expect(service.getNoteEditDefaults(member, 'lobby-1')).resolves.toEqual({
      name: '自分のノート',
      topic: undefined
    })
    expect(fetch).toHaveBeenCalledWith(note.channelId)
  })

  it('updates the owned note channel topic from a management panel', async () => {
    const config = createNoteConfig()
    const note = createNoteChannel()
    const setTopic = vi.fn().mockResolvedValue(undefined)
    const textChannel = {
      ...createTextChannel(note.channelId, vi.fn(), vi.fn()),
      setTopic
    }
    const repository = {
      getConfig: vi.fn().mockResolvedValue(config),
      getNoteByChannel: vi.fn().mockResolvedValue(note),
      deleteNoteByUser: vi.fn()
    } as unknown as NoteRepository
    const service = new NoteService(repository, createLoggerMock())
    const member = createMember(note.guildId, note.userId, {
      channels: {
        fetch: vi.fn().mockResolvedValue(textChannel)
      }
    })

    await expect(service.updateTopic(member, note.channelId, '  今日の作業ログ  ')).resolves.toBe(
      `チャンネルトピックを更新しました: <#${note.channelId}>`
    )

    expect(setTopic).toHaveBeenCalledWith(
      '今日の作業ログ',
      `Note topic changed by ${member.user.tag}`
    )
  })

  it('clears the owned note channel topic when the requested topic is blank', async () => {
    const config = createNoteConfig()
    const note = createNoteChannel()
    const setTopic = vi.fn().mockResolvedValue(undefined)
    const textChannel = {
      ...createTextChannel(note.channelId, vi.fn(), vi.fn()),
      setTopic
    }
    const repository = {
      getConfig: vi.fn().mockResolvedValue(config),
      getNoteByChannel: vi.fn().mockResolvedValue(note),
      deleteNoteByUser: vi.fn()
    } as unknown as NoteRepository
    const service = new NoteService(repository, createLoggerMock())
    const member = createMember(note.guildId, note.userId, {
      channels: {
        fetch: vi.fn().mockResolvedValue(textChannel)
      }
    })

    await expect(service.updateTopic(member, note.channelId, '   ')).resolves.toBe(
      `チャンネルトピックを削除しました: <#${note.channelId}>`
    )

    expect(setTopic).toHaveBeenCalledWith(null, `Note topic changed by ${member.user.tag}`)
  })

  it('syncs existing note channel permissions with here and everyone mentions disabled', async () => {
    const config = { ...createNoteConfig(), managerRoleId: 'manager-1' }
    const activeNote = createNoteChannel()
    const archivedNote = {
      ...createNoteChannel(),
      id: 2,
      userId: 'user-2',
      channelId: 'channel-2',
      status: 'archived' as const
    }
    const activePermissionEdit = vi.fn().mockResolvedValue(undefined)
    const archivedPermissionEdit = vi.fn().mockResolvedValue(undefined)
    const activeChannel = createTextChannel(activeNote.channelId, vi.fn(), activePermissionEdit)
    const archivedChannel = createTextChannel(
      archivedNote.channelId,
      vi.fn(),
      archivedPermissionEdit
    )
    const guild = createGuildForPermissionSync(config.guildId, [activeChannel, archivedChannel])
    const repository = {
      getConfig: vi.fn().mockResolvedValue(config),
      listNotes: vi.fn().mockResolvedValue([activeNote, archivedNote]),
      deleteNoteByUser: vi.fn()
    } as unknown as NoteRepository
    const service = new NoteService(repository, createLoggerMock())

    await expect(service.syncChannelPermissions(guild)).resolves.toEqual({
      total: 2,
      updated: 2,
      skipped: 0,
      failed: 0
    })

    expect(activePermissionEdit).toHaveBeenCalledWith(
      guild.roles.everyone,
      expect.objectContaining({ MentionEveryone: false }),
      expect.any(Object)
    )
    expect(activePermissionEdit).toHaveBeenCalledWith(
      activeNote.userId,
      expect.objectContaining({ MentionEveryone: false }),
      expect.objectContaining({ type: OverwriteType.Member })
    )
    expect(activePermissionEdit).toHaveBeenCalledWith(
      'bot-1',
      expect.objectContaining({ MentionEveryone: false }),
      expect.any(Object)
    )
    expect(activePermissionEdit).toHaveBeenCalledWith(
      config.managerRoleId,
      expect.objectContaining({ MentionEveryone: false }),
      expect.any(Object)
    )
    expect(archivedPermissionEdit).toHaveBeenCalledWith(
      guild.roles.everyone,
      expect.objectContaining({ MentionEveryone: false }),
      expect.any(Object)
    )
    expect(archivedPermissionEdit).toHaveBeenCalledWith(
      archivedNote.userId,
      expect.objectContaining({ MentionEveryone: false }),
      expect.objectContaining({ type: OverwriteType.Member })
    )
    expect(archivedPermissionEdit).toHaveBeenCalledWith(
      'bot-1',
      expect.objectContaining({ MentionEveryone: false }),
      expect.any(Object)
    )
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
      listCategories: vi
        .fn()
        .mockResolvedValue([createNoteCategory('guild-1', archiveCategory.id, 'archive')]),
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
      listCategories: vi
        .fn()
        .mockResolvedValue([createNoteCategory(config.guildId, archiveCategory.id, 'archive')]),
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

type ManagementPanelPayload = {
  content?: string
  embeds?: { toJSON(): { description?: string; title?: string } }[]
  allowedMentions?: { parse: string[] } | { users: string[] }
  components?: unknown[]
}

type ChannelCreatePayload = {
  permissionOverwrites?: NotePermissionOverwritePayload[]
}

type NotePermissionOverwritePayload = {
  id: string
  allow?: bigint[]
  deny?: bigint[]
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

function createGuildForNoteCreation(
  config: NoteConfig,
  category: { id: string; type: ChannelType },
  channelsCreate: ReturnType<typeof vi.fn>
): object {
  return {
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
        size: 1,
        filter: vi.fn(() => ({ size: 0 }))
      },
      fetch: vi.fn((channelId?: string) => {
        if (!channelId) {
          return Promise.resolve(new Map())
        }

        return Promise.resolve(channelId === category.id ? category : null)
      }),
      create: channelsCreate
    }
  }
}

function createGuildForPermissionSync(
  guildId: string,
  channels: { id: string; type: ChannelType }[]
): Guild {
  const channelMap = new Map(channels.map((channel) => [channel.id, channel]))

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
      fetch: vi.fn((channelId: string) => Promise.resolve(channelMap.get(channelId) ?? null))
    }
  } as unknown as Guild
}

function findOverwrite(
  overwrites: NotePermissionOverwritePayload[],
  id: string | undefined
): NotePermissionOverwritePayload | undefined {
  return overwrites.find((overwrite) => overwrite.id === id)
}

function createTextChannelWithMessages(
  channelId: string,
  messagesFetch: ReturnType<typeof vi.fn>,
  send: ReturnType<typeof vi.fn>
) {
  return {
    id: channelId,
    type: ChannelType.GuildText,
    send,
    messages: {
      fetch: messagesFetch
    }
  }
}

function createManagementPanelMessage(
  id: string,
  customIds: string[],
  edit: ReturnType<typeof vi.fn>
) {
  return {
    id,
    author: { id: 'bot-1' },
    content: 'old panel',
    embeds: [],
    components: [
      {
        components: customIds.map((customId) => ({ customId }))
      }
    ],
    edit
  }
}

function createGuildForPanelRefresh(
  note: NoteChannel,
  textChannel: { id: string; type: ChannelType },
  member: GuildMember
): Guild {
  const guild = {
    id: note.guildId,
    client: {
      user: { id: 'bot-1' }
    },
    channels: {
      fetch: vi.fn((channelId?: string) =>
        Promise.resolve(channelId === note.channelId ? textChannel : null)
      )
    },
    members: {
      fetch: vi.fn((userId: string) => Promise.resolve(userId === note.userId ? member : null))
    }
  }

  ;(textChannel as { guild?: unknown }).guild = guild

  return guild as unknown as Guild
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
          size: ([textChannel, archiveCategory] as { parentId?: string }[]).filter(predicate).length
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
    displayName: 'note-owner',
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
