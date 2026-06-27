import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  OverwriteType,
  PermissionFlagsBits,
  UserSelectMenuBuilder,
  type CategoryChannel,
  type Guild,
  type GuildMember,
  type NewsChannel,
  type PartialGuildMember,
  type TextChannel
} from 'discord.js'
import type { AppLogger } from '../../../platform/logger/logger'
import {
  type NoteCategory,
  type NoteCategoryKind,
  type NoteChannel,
  type NoteCommentMode,
  type NoteConfig,
  type NoteRepository,
  type NoteVisibility
} from '../repositories/noteRepository'

export const noteComponentCustomIdPrefix = 'note:'
export const noteOpenCustomId = `${noteComponentCustomIdPrefix}open`
export const noteRestoreCustomId = `${noteComponentCustomIdPrefix}restore`
export const noteRenameCustomId = `${noteComponentCustomIdPrefix}rename`
export const noteRepostManagementPanelCustomId = `${noteComponentCustomIdPrefix}repost-management-panel`
export const noteToggleVisibilityCustomId = `${noteComponentCustomIdPrefix}toggle-visibility`
export const noteToggleCommentsCustomId = `${noteComponentCustomIdPrefix}toggle-comments`
export const noteCloseCustomId = `${noteComponentCustomIdPrefix}close`
export const noteBlockUserCustomId = `${noteComponentCustomIdPrefix}block-user`
export const noteUnblockUserCustomId = `${noteComponentCustomIdPrefix}unblock-user`
export const noteBlockUserSelectCustomId = `${noteComponentCustomIdPrefix}block-user-select`
export const noteUnblockUserSelectCustomId = `${noteComponentCustomIdPrefix}unblock-user-select`

export const defaultNoteCategoryBaseName = 'ノート'
export const defaultNoteChannelNamePrefix = 'note'
export const noteMaxChannelsPerCategory = 50
const notePanelEmbedColor = 0x85e7ad
const discordUnknownChannelCode = 10003

type NoteSetupInput = {
  guild: Guild
  lobbyChannel: NoteLobbyChannel
  categoryBaseName?: string
  channelNamePrefix?: string
  creatorRoleId?: string
  managerRoleId?: string
}

type NoteStatus = {
  config?: NoteConfig
  activeCategories: NoteCategory[]
  archiveCategories: NoteCategory[]
  activeNotes: number
  archivedNotes: number
}

type PermissionOverwriteData = {
  id: string
  type?: OverwriteType
  allow?: bigint[]
  deny?: bigint[]
}

export type NoteLobbyChannel = TextChannel | NewsChannel

export class NoteUserError extends Error {
  constructor(readonly userMessage: string) {
    super(userMessage)
  }
}

export class NoteService {
  private readonly repository: NoteRepository
  private readonly logger: AppLogger
  private readonly pendingNoteCreations = new Set<string>()

  constructor(repository: NoteRepository, logger: AppLogger) {
    this.repository = repository
    this.logger = logger
  }

  async setup(input: NoteSetupInput): Promise<NoteConfig> {
    const categoryBaseName = normalizeBaseName(input.categoryBaseName, defaultNoteCategoryBaseName)
    const channelNamePrefix = normalizeChannelPrefix(input.channelNamePrefix)
    const archiveCategoryBaseName = `${categoryBaseName} Archive`

    await applyLobbyPermissions(input.guild, input.lobbyChannel)

    const config = await this.repository.setConfig({
      guildId: input.guild.id,
      lobbyChannelId: input.lobbyChannel.id,
      categoryBaseName,
      archiveCategoryBaseName,
      channelNamePrefix,
      creatorRoleId: input.creatorRoleId,
      managerRoleId: input.managerRoleId
    })
    const saved = await this.postLobbyPanel(input.guild, input.lobbyChannel, config)

    this.logger.info(
      { guildId: input.guild.id, lobbyChannelId: input.lobbyChannel.id },
      'Set up note panel'
    )

    return saved
  }

  async repostLobbyPanel(guild: Guild): Promise<NoteConfig> {
    const config = await this.getRequiredConfig(guild.id)
    const lobbyChannel = await guild.channels.fetch(config.lobbyChannelId).catch(() => null)

    if (!isNoteLobbyChannel(lobbyChannel)) {
      throw new NoteUserError(
        '設定済みのロビーチャンネルが見つかりません。/note setup でロビーを設定し直してください。'
      )
    }

    await applyLobbyPermissions(guild, lobbyChannel)
    const saved = await this.postLobbyPanel(guild, lobbyChannel, config)

    this.logger.info(
      { guildId: guild.id, lobbyChannelId: lobbyChannel.id },
      'Reposted note panel'
    )

    return saved
  }

  async getStatus(guildId: string): Promise<NoteStatus> {
    const [config, activeCategories, archiveCategories, counts] = await Promise.all([
      this.repository.getConfig(guildId),
      this.repository.listCategories(guildId, 'active'),
      this.repository.listCategories(guildId, 'archive'),
      this.repository.countNotes(guildId)
    ])

    return {
      config,
      activeCategories,
      archiveCategories,
      activeNotes: counts.active,
      archivedNotes: counts.archived
    }
  }

  async disable(guildId: string): Promise<boolean> {
    return this.repository.deleteConfig(guildId)
  }

  async openOrCreate(member: GuildMember): Promise<string> {
    const config = await this.getRequiredConfig(member.guild.id)
    const current = await this.repository.getNoteByUser(member.guild.id, member.id)

    if (current) {
      const channel = await this.fetchNoteTextChannel(member.guild, current)

      if (!channel) {
        await this.repository.deleteNoteByUser(member.guild.id, member.id)
        return this.createNote(member.guild, member, config)
      }

      if (current.status === 'archived') {
        return `あなたのノートは閉じられています。復元ボタンから戻せます: <#${current.channelId}>`
      }

      return `あなたのノートはこちらです: <#${current.channelId}>`
    }

    return this.createNote(member.guild, member, config)
  }

  async getManagementPanelMessage(member: GuildMember): Promise<string> {
    const note = await this.getOwnedActiveNote(member)
    const channel = await this.getRequiredNoteChannel(member.guild, note)

    return `自分の操作パネルを表示しました: <#${channel.id}>`
  }

  async ensureCanUseNoteControls(member: GuildMember, channelId: string): Promise<void> {
    const note = await this.repository.getNoteByChannel(channelId)

    if (!note || note.userId === member.id) {
      return
    }

    throw new NoteUserError('このノートの管理操作は作成者だけが使えます。')
  }

  async rename(member: GuildMember, requestedName: string): Promise<string> {
    const note = await this.getOwnedActiveNote(member)
    const channel = await this.getRequiredNoteChannel(member.guild, note)
    const name = normalizeCustomNoteChannelName(requestedName)

    if (!name) {
      throw new NoteUserError('使える文字を含むノート名を入力してください。')
    }

    await channel.setName(name, `Note renamed by ${member.user.tag}`)
    return `ノート名を <#${channel.id}> に変更しました。`
  }

  async toggleVisibility(member: GuildMember): Promise<string> {
    const [config, note] = await Promise.all([
      this.getRequiredConfig(member.guild.id),
      this.getOwnedActiveNote(member)
    ])
    const channel = await this.getRequiredNoteChannel(member.guild, note)
    const visibility: NoteVisibility = note.visibility === 'public' ? 'private' : 'public'

    await applyActiveNotePermissions(
      channel,
      member.guild,
      member.id,
      config,
      visibility,
      note.commentMode,
      `Note visibility changed by ${member.user.tag}`
    )
    await this.repository.updateNoteState(member.guild.id, member.id, { visibility })

    return visibility === 'public'
      ? `ノートを公開しました: <#${channel.id}>`
      : `ノートを非公開にしました: <#${channel.id}>`
  }

  async toggleComments(member: GuildMember): Promise<string> {
    const [config, note] = await Promise.all([
      this.getRequiredConfig(member.guild.id),
      this.getOwnedActiveNote(member)
    ])
    const channel = await this.getRequiredNoteChannel(member.guild, note)
    const commentMode: NoteCommentMode = note.commentMode === 'open' ? 'locked' : 'open'

    await applyActiveNotePermissions(
      channel,
      member.guild,
      member.id,
      config,
      note.visibility,
      commentMode,
      `Note comments changed by ${member.user.tag}`
    )
    await this.repository.updateNoteState(member.guild.id, member.id, { commentMode })

    return commentMode === 'open'
      ? `コメントを許可しました: <#${channel.id}>`
      : `コメントを停止しました: <#${channel.id}>`
  }

  async close(member: GuildMember, sourceChannelId?: string): Promise<string> {
    const [config, note] = await Promise.all([
      this.getRequiredConfig(member.guild.id),
      this.getOwnedActiveNote(member)
    ])

    if (sourceChannelId && sourceChannelId !== note.channelId) {
      throw new NoteUserError('閉じる操作は自分のノート内のパネルから実行してください。')
    }

    const channel = await this.getRequiredNoteChannel(member.guild, note)

    await this.archiveNoteChannel({
      guild: member.guild,
      ownerId: member.id,
      note,
      channel,
      config,
      reason: `Note closed by ${member.user.tag}`
    })

    return 'ノートを閉じました。ロビーの復元ボタンから再開できます。'
  }

  async archiveMemberNote(member: GuildMember | PartialGuildMember): Promise<boolean> {
    const [storedConfig, note] = await Promise.all([
      this.repository.getConfig(member.guild.id),
      this.repository.getNoteByUser(member.guild.id, member.id)
    ])

    if (!note || note.status === 'archived') {
      return false
    }

    const config = storedConfig ?? createFallbackNoteConfig(member.guild.id)

    if (!storedConfig) {
      this.logger.warn(
        { guildId: member.guild.id, userId: member.id },
        'Archiving note for departed member with fallback config because note config is missing'
      )
    }

    let channel: TextChannel | undefined

    try {
      channel = await this.fetchNoteTextChannel(member.guild, note)
    } catch (error) {
      this.logger.warn(
        { error, guildId: member.guild.id, userId: member.id, channelId: note.channelId },
        'Skipped archiving note for departed member because the channel could not be fetched'
      )
      return false
    }

    if (!channel) {
      await this.repository.deleteNoteByUser(member.guild.id, member.id)
      this.logger.warn(
        { guildId: member.guild.id, userId: member.id, channelId: note.channelId },
        'Deleted stale note record for departed member because the channel was missing'
      )
      return false
    }

    await this.archiveNoteChannel({
      guild: member.guild,
      ownerId: member.id,
      note,
      channel,
      config,
      reason: `Note archived because member left: ${member.user.tag}`
    })

    this.logger.info(
      { guildId: member.guild.id, userId: member.id, channelId: note.channelId },
      'Archived note for departed member'
    )

    return true
  }

  async restore(member: GuildMember): Promise<string> {
    const [config, note] = await Promise.all([
      this.getRequiredConfig(member.guild.id),
      this.repository.getNoteByUser(member.guild.id, member.id)
    ])

    if (!note) {
      throw new NoteUserError('復元できるノートがありません。')
    }

    if (note.status !== 'archived') {
      return `ノートはすでに開いています: <#${note.channelId}>`
    }

    const channel = await this.getRequiredNoteChannel(member.guild, note)
    const category = await this.findOrCreateCategory(member.guild, config, 'active')

    await channel.setParent(category.id, {
      lockPermissions: false,
      reason: `Note restored by ${member.user.tag}`
    })
    await applyActiveNotePermissions(
      channel,
      member.guild,
      member.id,
      config,
      note.visibility,
      note.commentMode,
      `Note restored by ${member.user.tag}`
    )
    await this.repository.updateNoteState(member.guild.id, member.id, {
      categoryId: category.id,
      status: 'active',
      archivedAt: null
    })

    return `ノートを復元しました: <#${channel.id}>`
  }

  async blockUser(member: GuildMember, channelId: string, targetUserId: string): Promise<string> {
    const { channel, config } = await this.getOwnedActiveNoteForControl(member, channelId)
    await this.ensureBlockTarget(member, targetUserId, config)

    await channel.permissionOverwrites.edit(
      targetUserId,
      {
        ViewChannel: false,
        SendMessages: false,
        AddReactions: false,
        AttachFiles: false,
        CreatePublicThreads: false,
        CreatePrivateThreads: false,
        SendMessagesInThreads: false
      },
      { reason: `Note user blocked by ${member.user.tag}` }
    )

    return `<@${targetUserId}> をこのノートからブロックしました。`
  }

  async unblockUser(member: GuildMember, channelId: string, targetUserId: string): Promise<string> {
    const { channel } = await this.getOwnedActiveNoteForControl(member, channelId)

    if (targetUserId === member.id) {
      throw new NoteUserError('自分自身は解除対象にできません。')
    }

    const overwrite = channel.permissionOverwrites.cache.get(targetUserId)

    if (!overwrite) {
      return `<@${targetUserId}> の個別ブロックは設定されていません。`
    }

    await channel.permissionOverwrites.delete(
      targetUserId,
      `Note user unblocked by ${member.user.tag}`
    )

    return `<@${targetUserId}> のブロックを解除しました。`
  }

  async deleteChannelRecord(channel: { id: string; guild?: { id: string } }): Promise<void> {
    const guildId = channel.guild?.id

    if (!guildId) {
      return
    }

    await Promise.all([
      this.repository.deleteNoteByChannel(channel.id),
      this.repository.deleteCategory(guildId, channel.id)
    ])
  }

  async deleteByGuild(guildId: string): Promise<number> {
    return this.repository.deleteByGuild(guildId)
  }

  private async createNote(guild: Guild, member: GuildMember, config: NoteConfig): Promise<string> {
    const pendingKey = `${guild.id}:${member.id}`

    if (this.pendingNoteCreations.has(pendingKey)) {
      throw new NoteUserError('ノートを作成中です。少し待ってからもう一度開いてください。')
    }

    this.pendingNoteCreations.add(pendingKey)

    try {
      return await this.createNoteWithLock(guild, member, config)
    } finally {
      this.pendingNoteCreations.delete(pendingKey)
    }
  }

  private async createNoteWithLock(
    guild: Guild,
    member: GuildMember,
    config: NoteConfig
  ): Promise<string> {
    const current = await this.repository.getNoteByUser(guild.id, member.id)

    if (current) {
      return `あなたのノートはこちらです: <#${current.channelId}>`
    }

    ensureCanCreateNote(member, config)

    if (guild.channels.cache.size >= 500) {
      throw new NoteUserError(
        'サーバーのチャンネル数が上限に達しているため、ノートを作成できません。'
      )
    }

    const category = await this.findOrCreateCategory(guild, config, 'active')
    const name = createDefaultNoteChannelName(
      config.channelNamePrefix,
      member.displayName,
      member.id
    )
    const channel = await guild.channels.create({
      name,
      type: ChannelType.GuildText,
      parent: category.id,
      topic: `作成者: ${member.displayName} (${member.id}) / ノート`,
      permissionOverwrites: createActiveNotePermissionOverwrites(
        guild,
        member.id,
        config,
        'public',
        'open'
      ),
      reason: `Note created by ${member.user.tag}`
    })

    try {
      await this.repository.createNote({
        guildId: guild.id,
        userId: member.id,
        channelId: channel.id,
        categoryId: category.id,
        visibility: 'public',
        commentMode: 'open'
      })
    } catch (error) {
      await channel.delete('Rolling back untracked note channel').catch((deleteError: unknown) => {
        this.logger.warn(
          { error: deleteError, guildId: guild.id, channelId: channel.id },
          'Failed to delete untracked note channel'
        )
      })
      throw error
    }

    this.logger.info(
      { guildId: guild.id, userId: member.id, channelId: channel.id },
      'Created note'
    )

    return `ノートを作成しました: <#${channel.id}>`
  }

  private async getOwnedActiveNoteForControl(
    member: GuildMember,
    channelId: string
  ): Promise<{ channel: TextChannel; config: NoteConfig; note: NoteChannel }> {
    const [config, noteInSourceChannel] = await Promise.all([
      this.getRequiredConfig(member.guild.id),
      this.repository.getNoteByChannel(channelId)
    ])

    if (noteInSourceChannel) {
      if (noteInSourceChannel.userId !== member.id) {
        throw new NoteUserError('このノートの管理操作は作成者だけが使えます。')
      }

      if (noteInSourceChannel.status === 'archived') {
        throw new NoteUserError('このノートは閉じられています。復元してから操作してください。')
      }

      const channel = await this.getRequiredNoteChannel(member.guild, noteInSourceChannel)
      return { channel, config, note: noteInSourceChannel }
    }

    const note = await this.getOwnedActiveNote(member)
    const channel = await this.getRequiredNoteChannel(member.guild, note)
    return { channel, config, note }
  }

  private async ensureBlockTarget(
    member: GuildMember,
    targetUserId: string,
    config: NoteConfig
  ): Promise<void> {
    if (targetUserId === member.id) {
      throw new NoteUserError('自分自身はブロックできません。')
    }

    const botId = member.guild.members.me?.id ?? member.guild.client.user?.id

    if (targetUserId === botId) {
      throw new NoteUserError('Bot はブロックできません。')
    }

    const targetMember = await member.guild.members.fetch(targetUserId).catch(() => null)

    if (targetMember?.permissions.has(PermissionFlagsBits.Administrator)) {
      throw new NoteUserError('管理者はブロックできません。')
    }

    if (config.managerRoleId && targetMember?.roles.cache.has(config.managerRoleId)) {
      throw new NoteUserError('ノート管理ロールのメンバーはブロックできません。')
    }
  }

  private async getRequiredConfig(guildId: string): Promise<NoteConfig> {
    const config = await this.repository.getConfig(guildId)

    if (!config) {
      throw new NoteUserError('ノート機能はまだ設定されていません。')
    }

    return config
  }

  private async postLobbyPanel(
    guild: Guild,
    lobbyChannel: NoteLobbyChannel,
    config: NoteConfig
  ): Promise<NoteConfig> {
    const panelMessage = await lobbyChannel.send({
      embeds: [createNoteLobbyPanelEmbed(config)],
      allowedMentions: { parse: [] },
      components: createNoteLobbyActionRows()
    })
    const saved = await this.repository.updatePanelMessage(guild.id, panelMessage.id)

    return saved ?? config
  }

  private async getOwnedActiveNote(member: GuildMember): Promise<NoteChannel> {
    const note = await this.repository.getNoteByUser(member.guild.id, member.id)

    if (!note) {
      throw new NoteUserError('まだノートがありません。先にロビーからノートを作成してください。')
    }

    if (note.status === 'archived') {
      throw new NoteUserError(
        'このノートは閉じられています。ロビーの復元ボタンから再開してください。'
      )
    }

    return note
  }

  private async getRequiredNoteChannel(guild: Guild, note: NoteChannel): Promise<TextChannel> {
    const channel = await this.fetchNoteTextChannel(guild, note)

    if (!channel) {
      await this.repository.deleteNoteByUser(guild.id, note.userId)
      throw new NoteUserError(
        '保存されていたノートチャンネルが見つかりませんでした。もう一度作成してください。'
      )
    }

    return channel
  }

  private async archiveNoteChannel(input: {
    guild: Guild
    ownerId: string
    note: NoteChannel
    channel: TextChannel
    config: NoteConfig
    reason: string
  }): Promise<void> {
    const category = await this.findOrCreateCategory(input.guild, input.config, 'archive')

    try {
      await input.channel.setParent(category.id, {
        lockPermissions: false,
        reason: input.reason
      })
      await applyArchivedNotePermissions(
        input.channel,
        input.guild,
        input.ownerId,
        input.config,
        input.reason
      )
      const updated = await this.repository.updateNoteState(input.guild.id, input.ownerId, {
        categoryId: category.id,
        status: 'archived',
        archivedAt: new Date().toISOString()
      })

      if (!updated) {
        throw new Error('Failed to archive note record because it no longer exists')
      }
    } catch (error) {
      await this.rollbackArchivedNoteChannel(input).catch((rollbackError: unknown) => {
        this.logger.error(
          {
            error: rollbackError,
            cause: error,
            guildId: input.guild.id,
            userId: input.ownerId,
            channelId: input.note.channelId
          },
          'Failed to roll back Discord note archive state'
        )
      })
      throw error
    }
  }

  private async rollbackArchivedNoteChannel(input: {
    guild: Guild
    ownerId: string
    note: NoteChannel
    channel: TextChannel
    config: NoteConfig
    reason: string
  }): Promise<void> {
    const reason = `Rollback ${input.reason}`

    await input.channel.setParent(input.note.categoryId, {
      lockPermissions: false,
      reason
    })
    await applyActiveNotePermissions(
      input.channel,
      input.guild,
      input.ownerId,
      input.config,
      input.note.visibility,
      input.note.commentMode,
      reason
    )
  }

  private async fetchNoteTextChannel(
    guild: Guild,
    note: Pick<NoteChannel, 'channelId'>
  ): Promise<TextChannel | undefined> {
    let channel

    try {
      channel = await guild.channels.fetch(note.channelId)
    } catch (error) {
      if (isDiscordUnknownChannelError(error)) {
        return undefined
      }

      throw error
    }

    return isTextChannel(channel) ? channel : undefined
  }

  private async findOrCreateCategory(
    guild: Guild,
    config: NoteConfig,
    kind: NoteCategoryKind
  ): Promise<CategoryChannel> {
    await guild.channels.fetch().catch((error: unknown) => {
      this.logger.warn({ error, guildId: guild.id }, 'Failed to refresh guild channels')
    })

    const categories = await this.repository.listCategories(guild.id, kind)

    for (const category of categories) {
      let channel

      try {
        channel = await guild.channels.fetch(category.categoryId)
      } catch (error) {
        if (isDiscordUnknownChannelError(error)) {
          channel = null
        } else {
          this.logger.warn(
            { error, guildId: guild.id, categoryId: category.categoryId },
            'Failed to fetch managed note category'
          )
          throw error
        }
      }

      if (!isCategoryChannel(channel)) {
        await this.repository.deleteCategory(guild.id, category.categoryId)
        continue
      }

      if (countCategoryChildren(guild, channel.id) < noteMaxChannelsPerCategory) {
        return channel
      }
    }

    if (guild.channels.cache.size >= 500) {
      throw new NoteUserError(
        'サーバーのチャンネル数が上限に達しているため、カテゴリを作成できません。'
      )
    }

    const sortOrder = nextCategorySortOrder(categories)
    const categoryName = createManagedCategoryName(
      kind === 'archive' ? config.archiveCategoryBaseName : config.categoryBaseName,
      sortOrder
    )
    const created = await guild.channels.create({
      name: categoryName,
      type: ChannelType.GuildCategory,
      permissionOverwrites: createCategoryPermissionOverwrites(guild, config),
      reason: `Note ${kind} category created`
    })

    if (!isCategoryChannel(created)) {
      throw new NoteUserError('ノートカテゴリの作成に失敗しました。')
    }

    await this.repository.addCategory({
      guildId: guild.id,
      categoryId: created.id,
      kind,
      sortOrder
    })

    return created
  }
}

export function createNoteLobbyActionRows(): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(noteOpenCustomId)
        .setLabel('ノートを作る / 開く')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(noteRestoreCustomId)
        .setLabel('閉じたノートを復元')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(noteRenameCustomId)
        .setLabel('ノート名を変える')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(noteRepostManagementPanelCustomId)
        .setLabel('操作パネルを再投稿')
        .setStyle(ButtonStyle.Secondary)
    )
  ]
}

export function createNoteManagementActionRows(): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(noteRenameCustomId)
        .setLabel('名前変更')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(noteToggleVisibilityCustomId)
        .setLabel('公開 / 非公開')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(noteToggleCommentsCustomId)
        .setLabel('コメント可否')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(noteCloseCustomId)
        .setLabel('閉じる')
        .setStyle(ButtonStyle.Danger)
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(noteBlockUserCustomId)
        .setLabel('ユーザーをブロック')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(noteUnblockUserCustomId)
        .setLabel('ブロック解除')
        .setStyle(ButtonStyle.Secondary)
    )
  ]
}

export function createNoteBlockUserActionRows(): ActionRowBuilder<UserSelectMenuBuilder>[] {
  return [
    new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
      new UserSelectMenuBuilder()
        .setCustomId(noteBlockUserSelectCustomId)
        .setPlaceholder('ブロックするユーザーを選択')
        .setMinValues(1)
        .setMaxValues(1)
    )
  ]
}

export function createNoteUnblockUserActionRows(): ActionRowBuilder<UserSelectMenuBuilder>[] {
  return [
    new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
      new UserSelectMenuBuilder()
        .setCustomId(noteUnblockUserSelectCustomId)
        .setPlaceholder('ブロック解除するユーザーを選択')
        .setMinValues(1)
        .setMaxValues(1)
    )
  ]
}

export function createNoteLobbyPanelContent(config?: Pick<NoteConfig, 'creatorRoleId'>): string {
  const lines = [
    '自分のノートをひとつ持てます。',
    '',
    '日記、メモ、作業ログ、近況、好きなものの置き場にどうぞ。',
    '最初は公開されるので、ほかの人のノートにも気軽にコメントできます。'
  ]

  if (config?.creatorRoleId) {
    lines.push('')
    lines.push(`<@&${config.creatorRoleId}> を持っている人がノートを作れます。`)
  }

  lines.push('')
  lines.push('自分の操作パネルは、ロビーからいつでも再表示できます。')
  lines.push('閉じたノートは、ロビーから復元できます。')
  lines.push('公開設定、コメント設定、ブロック、閉じる操作はノート内のパネルから行えます。')

  return lines.join('\n')
}

export function createNoteLobbyPanelEmbed(config?: Pick<NoteConfig, 'creatorRoleId'>): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(notePanelEmbedColor)
    .setTitle('ノート')
    .setDescription(createNoteLobbyPanelContent(config))
}

export function createNoteManagementPanelEmbed(member: GuildMember): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(notePanelEmbedColor)
    .setTitle('ノート操作')
    .setDescription(createNoteCreatedContent(member))
}

export function createNoteBlockUserPanelEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(notePanelEmbedColor)
    .setTitle('ユーザーをブロック')
    .setDescription('このノートからブロックするユーザーを選択してください。')
}

export function createNoteUnblockUserPanelEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(notePanelEmbedColor)
    .setTitle('ブロック解除')
    .setDescription('このノートでブロック解除するユーザーを選択してください。')
}

export function createNoteCreatedContent(member: GuildMember): string {
  return [
    `<@${member.id}> さんのノートです。`,
    '',
    '日記、メモ、作業ログなどを自由にどうぞ。',
    '交流しやすいように、作成直後は公開・コメント可になっています。',
    '',
    '自分の操作パネルは、ロビーからいつでも再表示できます。',
    '閉じたノートはロビーから復元できます。'
  ].join('\n')
}

export function isNoteLobbyChannel(channel: unknown): channel is NoteLobbyChannel {
  return (
    typeof channel === 'object' &&
    channel !== null &&
    'type' in channel &&
    ((channel as { type?: unknown }).type === ChannelType.GuildText ||
      (channel as { type?: unknown }).type === ChannelType.GuildAnnouncement) &&
    'send' in channel &&
    typeof (channel as { send?: unknown }).send === 'function'
  )
}

export function createDefaultNoteChannelName(
  prefix: string,
  displayName: string,
  userId: string
): string {
  const normalizedDisplayName = normalizeCustomNoteChannelName(displayName)

  if (normalizedDisplayName) {
    return `${normalizedDisplayName}のノート`.slice(0, 100)
  }

  return `${normalizeChannelPrefix(prefix)}-${userId.slice(-6)}`
}

export function normalizeCustomNoteChannelName(value: string): string | undefined {
  const normalized = value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s_]+/gu, '-')
    .replace(/[^\p{Letter}\p{Number}-]+/gu, '-')
    .replace(/-+/gu, '-')
    .replace(/^-|-$/gu, '')
    .slice(0, 100)

  return normalized.length > 0 ? normalized : undefined
}

function normalizeBaseName(value: string | undefined, fallback: string): string {
  const normalized = value?.trim().slice(0, 64)
  return normalized && normalized.length > 0 ? normalized : fallback
}

function normalizeChannelPrefix(value: string | undefined): string {
  return (
    normalizeCustomNoteChannelName(value ?? defaultNoteChannelNamePrefix)?.slice(0, 32) ??
    defaultNoteChannelNamePrefix
  )
}

function ensureCanCreateNote(member: GuildMember, config: Pick<NoteConfig, 'creatorRoleId'>): void {
  if (!config.creatorRoleId) {
    return
  }

  if (member.roles.cache.has(config.creatorRoleId)) {
    return
  }

  throw new NoteUserError(`ノートを作成するには <@&${config.creatorRoleId}> ロールが必要です。`)
}

function createManagedCategoryName(baseName: string, sortOrder: number): string {
  return sortOrder <= 1 ? baseName : `${baseName} ${sortOrder}`
}

function nextCategorySortOrder(categories: NoteCategory[]): number {
  return Math.max(0, ...categories.map((category) => category.sortOrder)) + 1
}

async function applyLobbyPermissions(guild: Guild, channel: NoteLobbyChannel): Promise<void> {
  await channel.permissionOverwrites.edit(
    guild.roles.everyone,
    {
      SendMessages: false,
      CreatePublicThreads: false,
      CreatePrivateThreads: false,
      SendMessagesInThreads: false,
      AddReactions: false
    },
    { reason: 'Note lobby panel setup' }
  )
}

function createCategoryPermissionOverwrites(
  guild: Guild,
  config: Pick<NoteConfig, 'managerRoleId'>
): PermissionOverwriteData[] {
  const overwrites: PermissionOverwriteData[] = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel]
    }
  ]

  addBotOverwrite(guild, overwrites)
  addManagerRoleOverwrite(config, overwrites, true)
  return overwrites
}

function createActiveNotePermissionOverwrites(
  guild: Guild,
  ownerId: string,
  config: Pick<NoteConfig, 'managerRoleId'>,
  visibility: NoteVisibility,
  commentMode: NoteCommentMode
): PermissionOverwriteData[] {
  const overwrites: PermissionOverwriteData[] = [
    createEveryoneActiveOverwrite(guild, visibility, commentMode),
    {
      id: ownerId,
      type: OverwriteType.Member,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AddReactions,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks
      ],
      deny: [PermissionFlagsBits.CreatePublicThreads, PermissionFlagsBits.CreatePrivateThreads]
    }
  ]

  addBotOverwrite(guild, overwrites)
  addManagerRoleOverwrite(config, overwrites, true)
  return overwrites
}

function createFallbackNoteConfig(guildId: string): NoteConfig {
  const now = new Date().toISOString()

  return {
    guildId,
    lobbyChannelId: '',
    categoryBaseName: defaultNoteCategoryBaseName,
    archiveCategoryBaseName: `${defaultNoteCategoryBaseName} Archive`,
    channelNamePrefix: defaultNoteChannelNamePrefix,
    createdAt: now,
    updatedAt: now
  }
}

function isDiscordUnknownChannelError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === discordUnknownChannelCode
  )
}

function createEveryoneActiveOverwrite(
  guild: Guild,
  visibility: NoteVisibility,
  commentMode: NoteCommentMode
): PermissionOverwriteData {
  if (visibility === 'private') {
    return {
      id: guild.roles.everyone.id,
      deny: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.CreatePublicThreads,
        PermissionFlagsBits.CreatePrivateThreads,
        PermissionFlagsBits.SendMessagesInThreads,
        PermissionFlagsBits.AddReactions
      ]
    }
  }

  if (commentMode === 'locked') {
    return {
      id: guild.roles.everyone.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AddReactions
      ],
      deny: [
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.CreatePublicThreads,
        PermissionFlagsBits.CreatePrivateThreads,
        PermissionFlagsBits.SendMessagesInThreads
      ]
    }
  }

  return {
    id: guild.roles.everyone.id,
    allow: [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.ReadMessageHistory,
      PermissionFlagsBits.AddReactions
    ],
    deny: [
      PermissionFlagsBits.CreatePublicThreads,
      PermissionFlagsBits.CreatePrivateThreads,
      PermissionFlagsBits.SendMessagesInThreads
    ]
  }
}

function addBotOverwrite(guild: Guild, overwrites: PermissionOverwriteData[]): void {
  const botId = guild.members.me?.id ?? guild.client.user?.id

  if (!botId) {
    return
  }

  overwrites.push({
    id: botId,
    allow: [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.ManageChannels,
      PermissionFlagsBits.ManageMessages,
      PermissionFlagsBits.ReadMessageHistory,
      PermissionFlagsBits.AddReactions,
      PermissionFlagsBits.EmbedLinks
    ]
  })
}

function addManagerRoleOverwrite(
  config: Pick<NoteConfig, 'managerRoleId'>,
  overwrites: PermissionOverwriteData[],
  canSend: boolean
): void {
  if (!config.managerRoleId) {
    return
  }

  overwrites.push({
    id: config.managerRoleId,
    allow: [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.ReadMessageHistory,
      PermissionFlagsBits.ManageMessages,
      ...(canSend ? [PermissionFlagsBits.SendMessages] : [])
    ]
  })
}

async function applyActiveNotePermissions(
  channel: TextChannel,
  guild: Guild,
  ownerId: string,
  config: Pick<NoteConfig, 'managerRoleId'>,
  visibility: NoteVisibility,
  commentMode: NoteCommentMode,
  reason: string
): Promise<void> {
  const updates: Promise<unknown>[] = [
    channel.permissionOverwrites.edit(
      guild.roles.everyone,
      createEveryoneActivePermissionOptions(visibility, commentMode),
      { reason }
    ),
    channel.permissionOverwrites.edit(
      ownerId,
      {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
        AddReactions: true,
        AttachFiles: true,
        EmbedLinks: true,
        CreatePublicThreads: false,
        CreatePrivateThreads: false
      },
      { reason, type: OverwriteType.Member }
    )
  ]

  const botId = guild.members.me?.id ?? guild.client.user?.id

  if (botId) {
    updates.push(
      channel.permissionOverwrites.edit(
        botId,
        {
          ViewChannel: true,
          SendMessages: true,
          ManageChannels: true,
          ManageMessages: true,
          ReadMessageHistory: true,
          AddReactions: true,
          EmbedLinks: true
        },
        { reason }
      )
    )
  }

  if (config.managerRoleId) {
    updates.push(
      channel.permissionOverwrites.edit(
        config.managerRoleId,
        {
          ViewChannel: true,
          SendMessages: true,
          ManageMessages: true,
          ReadMessageHistory: true
        },
        { reason }
      )
    )
  }

  await Promise.all(updates)
}

async function applyArchivedNotePermissions(
  channel: TextChannel,
  guild: Guild,
  ownerId: string,
  config: Pick<NoteConfig, 'managerRoleId'>,
  reason: string
): Promise<void> {
  const updates: Promise<unknown>[] = [
    channel.permissionOverwrites.edit(
      guild.roles.everyone,
      {
        ViewChannel: false,
        SendMessages: false,
        CreatePublicThreads: false,
        CreatePrivateThreads: false,
        SendMessagesInThreads: false,
        AddReactions: false
      },
      { reason }
    ),
    channel.permissionOverwrites.edit(
      ownerId,
      {
        ViewChannel: false,
        SendMessages: false
      },
      { reason, type: OverwriteType.Member }
    )
  ]

  const botId = guild.members.me?.id ?? guild.client.user?.id

  if (botId) {
    updates.push(
      channel.permissionOverwrites.edit(
        botId,
        {
          ViewChannel: true,
          SendMessages: true,
          ManageChannels: true,
          ManageMessages: true,
          ReadMessageHistory: true,
          AddReactions: true,
          EmbedLinks: true
        },
        { reason }
      )
    )
  }

  if (config.managerRoleId) {
    updates.push(
      channel.permissionOverwrites.edit(
        config.managerRoleId,
        {
          ViewChannel: true,
          SendMessages: true,
          ManageMessages: true,
          ReadMessageHistory: true
        },
        { reason }
      )
    )
  }

  await Promise.all(updates)
}

function createEveryoneActivePermissionOptions(
  visibility: NoteVisibility,
  commentMode: NoteCommentMode
): Record<string, boolean> {
  if (visibility === 'private') {
    return {
      ViewChannel: false,
      SendMessages: false,
      CreatePublicThreads: false,
      CreatePrivateThreads: false,
      SendMessagesInThreads: false,
      AddReactions: false
    }
  }

  if (commentMode === 'locked') {
    return {
      ViewChannel: true,
      ReadMessageHistory: true,
      AddReactions: true,
      SendMessages: false,
      CreatePublicThreads: false,
      CreatePrivateThreads: false,
      SendMessagesInThreads: false
    }
  }

  return {
    ViewChannel: true,
    SendMessages: true,
    ReadMessageHistory: true,
    AddReactions: true,
    CreatePublicThreads: false,
    CreatePrivateThreads: false,
    SendMessagesInThreads: false
  }
}

function countCategoryChildren(guild: Guild, categoryId: string): number {
  return guild.channels.cache.filter((channel) => channel.parentId === categoryId).size
}

function isTextChannel(channel: unknown): channel is TextChannel {
  return (
    typeof channel === 'object' &&
    channel !== null &&
    'type' in channel &&
    (channel as { type?: unknown }).type === ChannelType.GuildText
  )
}

function isCategoryChannel(channel: unknown): channel is CategoryChannel {
  return (
    typeof channel === 'object' &&
    channel !== null &&
    'type' in channel &&
    (channel as { type?: unknown }).type === ChannelType.GuildCategory
  )
}
