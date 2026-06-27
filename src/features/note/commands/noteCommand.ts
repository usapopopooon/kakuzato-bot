import {
  ActionRowBuilder,
  ChannelType,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ChatInputCommandInteraction,
  type MessageComponentInteraction,
  type ModalSubmitInteraction
} from 'discord.js'
import type {
  DiscordCommand,
  DiscordComponentHandler,
  DiscordModalSubmitHandler
} from '../../../platform/discord/botModule'
import {
  defaultNoteCategoryBaseName,
  defaultNoteChannelNamePrefix,
  createNoteBlockUserActionRows,
  createNoteUnblockUserActionRows,
  isNoteLobbyChannel,
  noteBlockUserCustomId,
  noteBlockUserSelectCustomId,
  noteCloseCustomId,
  noteComponentCustomIdPrefix,
  noteOpenCustomId,
  noteRenameCustomId,
  noteRestoreCustomId,
  noteToggleCommentsCustomId,
  noteToggleVisibilityCustomId,
  noteUnblockUserCustomId,
  noteUnblockUserSelectCustomId,
  NoteUserError,
  type NoteLobbyChannel,
  type NoteService
} from '../services/noteService'

const noteRenameModalCustomId = 'note-modal:rename'
const noteRenameInputId = 'note-rename-name'

export function createNoteCommand(service: NoteService): DiscordCommand {
  return {
    data: new SlashCommandBuilder()
      .setName('note')
      .setDescription('ノート機能を管理します')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .setDMPermission(false)
      .addSubcommand((subcommand) =>
        subcommand
          .setName('setup')
          .setDescription('ノート作成パネルを設置します')
          .addChannelOption((option) =>
            option
              .setName('lobby')
              .setDescription('ノート作成パネルを置くロビーチャンネル')
              .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
              .setRequired(true)
          )
          .addRoleOption((option) =>
            option
              .setName('creator_role')
              .setDescription('ノートを作成できるロール')
          )
          .addStringOption((option) =>
            option
              .setName('category_base_name')
              .setDescription('ノートカテゴリのベース名')
              .setMaxLength(64)
          )
          .addStringOption((option) =>
            option
              .setName('channel_prefix')
              .setDescription('表示名を使えない場合のチャンネル名接頭辞')
              .setMaxLength(32)
          )
          .addRoleOption((option) =>
            option.setName('manager_role').setDescription('ノートを管理できるロール')
          )
      )
      .addSubcommand((subcommand) =>
        subcommand.setName('repost').setDescription('現在の設定でノート作成パネルを再投稿します')
      )
      .addSubcommand((subcommand) =>
        subcommand.setName('status').setDescription('ノート機能の設定を表示します')
      )
      .addSubcommand((subcommand) =>
        subcommand.setName('disable').setDescription('ノート作成パネル設定を解除します')
      ),
    execute: (interaction) => executeNoteCommand(interaction, service)
  }
}

export function createNoteComponentHandler(service: NoteService): DiscordComponentHandler {
  return {
    customIdPrefix: noteComponentCustomIdPrefix,
    execute: (interaction) => executeNoteComponent(interaction, service)
  }
}

export function createNoteModalSubmitHandler(service: NoteService): DiscordModalSubmitHandler {
  return {
    customIdPrefix: 'note-modal:',
    execute: (interaction) => executeNoteModalSubmit(interaction, service)
  }
}

async function executeNoteCommand(
  interaction: ChatInputCommandInteraction,
  service: NoteService
): Promise<void> {
  if (!interaction.inCachedGuild()) {
    await interaction.reply({
      content: 'このコマンドはサーバー内でのみ実行できます。',
      flags: MessageFlags.Ephemeral
    })
    return
  }

  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({
      content: 'このコマンドは管理者のみ実行できます。',
      flags: MessageFlags.Ephemeral
    })
    return
  }

  const subcommand = interaction.options.getSubcommand()

  if (subcommand === 'setup') {
    await handleSetup(interaction, service)
    return
  }

  if (subcommand === 'repost') {
    await handleRepost(interaction, service)
    return
  }

  if (subcommand === 'status') {
    await handleStatus(interaction, service)
    return
  }

  if (subcommand === 'disable') {
    await handleDisable(interaction, service)
  }
}

async function handleSetup(
  interaction: ChatInputCommandInteraction<'cached'>,
  service: NoteService
): Promise<void> {
  const selectedLobby = interaction.options.getChannel('lobby', true)
  const lobbyChannel = await interaction.guild.channels.fetch(selectedLobby.id).catch(() => null)

  if (!isNoteLobbyChannel(lobbyChannel)) {
    await interaction.reply({
      content: 'ロビーには通常のテキストチャンネルを指定してください。',
      flags: MessageFlags.Ephemeral
    })
    return
  }

  if (!canBotManageNoteLobby(lobbyChannel, interaction)) {
    await interaction.reply({
      content:
        'ロビーチャンネルでメッセージ送信と権限管理を行う権限、またはチャンネル管理権限が Bot にありません。',
      flags: MessageFlags.Ephemeral
    })
    return
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral })

  const config = await service.setup({
    guild: interaction.guild,
    lobbyChannel,
    categoryBaseName:
      interaction.options.getString('category_base_name') ?? defaultNoteCategoryBaseName,
    channelNamePrefix:
      interaction.options.getString('channel_prefix') ?? defaultNoteChannelNamePrefix,
    creatorRoleId: interaction.options.getRole('creator_role')?.id,
    managerRoleId: interaction.options.getRole('manager_role')?.id
  })

  await interaction.editReply({
    content: [
      'ノート作成パネルを設置しました。',
      `ロビー: <#${config.lobbyChannelId}>`,
      `カテゴリ: ${config.categoryBaseName}`,
      `アーカイブ: ${config.archiveCategoryBaseName}`,
      `作成可能ロール: ${config.creatorRoleId ? `<@&${config.creatorRoleId}>` : '未設定'}`,
      `管理ロール: ${config.managerRoleId ? `<@&${config.managerRoleId}>` : '未設定'}`
    ].join('\n'),
    allowedMentions: { parse: [] }
  })
}

async function handleRepost(
  interaction: ChatInputCommandInteraction<'cached'>,
  service: NoteService
): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral })

  try {
    const config = await service.repostLobbyPanel(interaction.guild)

    await interaction.editReply({
      content: [
        'ノート作成パネルを再投稿しました。',
        `ロビー: <#${config.lobbyChannelId}>`,
        `パネルメッセージ: ${config.panelMessageId ?? '不明'}`
      ].join('\n'),
      allowedMentions: { parse: [] }
    })
  } catch (error) {
    if (error instanceof NoteUserError) {
      await interaction.editReply({
        content: error.userMessage,
        allowedMentions: { parse: [] }
      })
      return
    }

    throw error
  }
}

async function handleStatus(
  interaction: ChatInputCommandInteraction<'cached'>,
  service: NoteService
): Promise<void> {
  const status = await service.getStatus(interaction.guildId)

  if (!status.config) {
    await interaction.reply({
      content: 'ノート機能は設定されていません。',
      flags: MessageFlags.Ephemeral
    })
    return
  }

  await interaction.reply({
    content: [
      'ノート機能は有効です。',
      `ロビー: <#${status.config.lobbyChannelId}>`,
      `パネルメッセージ: ${status.config.panelMessageId ?? '不明'}`,
      `カテゴリ: ${status.config.categoryBaseName} (${status.activeCategories.length})`,
      `アーカイブ: ${status.config.archiveCategoryBaseName} (${status.archiveCategories.length})`,
      `ノート: ${status.activeNotes}件 / 閉じたノート: ${status.archivedNotes}件`,
      `作成可能ロール: ${status.config.creatorRoleId ? `<@&${status.config.creatorRoleId}>` : '未設定'}`,
      `管理ロール: ${status.config.managerRoleId ? `<@&${status.config.managerRoleId}>` : '未設定'}`
    ].join('\n'),
    flags: MessageFlags.Ephemeral,
    allowedMentions: { parse: [] }
  })
}

async function handleDisable(
  interaction: ChatInputCommandInteraction<'cached'>,
  service: NoteService
): Promise<void> {
  const deleted = await service.disable(interaction.guildId)

  await interaction.reply({
    content: deleted
      ? 'ノート作成パネル設定を解除しました。既存のノートチャンネルは残ります。'
      : 'ノート機能は設定されていません。',
    flags: MessageFlags.Ephemeral
  })
}

async function executeNoteComponent(
  interaction: MessageComponentInteraction,
  service: NoteService
): Promise<void> {
  if (!interaction.inCachedGuild()) {
    await interaction.reply({
      content: 'この操作はサーバー内でのみ実行できます。',
      flags: MessageFlags.Ephemeral
    })
    return
  }

  if (interaction.isUserSelectMenu()) {
    await handleUserSelect(interaction, service)
    return
  }

  if (!interaction.isButton()) {
    await interaction.reply({
      content: 'この操作には対応していません。',
      flags: MessageFlags.Ephemeral
    })
    return
  }

  if (interaction.customId === noteRenameCustomId) {
    await handleRenameButton(interaction, service)
    return
  }

  if (interaction.customId === noteBlockUserCustomId) {
    await handleBlockUserButton(interaction, service)
    return
  }

  if (interaction.customId === noteUnblockUserCustomId) {
    await handleUnblockUserButton(interaction, service)
    return
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral })

  try {
    const content = await executeDeferredNoteButton(interaction, service)
    await interaction.editReply({ content })
  } catch (error) {
    if (error instanceof NoteUserError) {
      await interaction.editReply({ content: error.userMessage })
      return
    }

    throw error
  }
}

async function executeDeferredNoteButton(
  interaction: MessageComponentInteraction<'cached'>,
  service: NoteService
): Promise<string> {
  if (interaction.customId === noteOpenCustomId) {
    return service.openOrCreate(interaction.member)
  }

  if (interaction.customId === noteRestoreCustomId) {
    return service.restore(interaction.member)
  }

  if (interaction.customId === noteToggleVisibilityCustomId) {
    await service.ensureCanUseNoteControls(interaction.member, interaction.channelId)
    return service.toggleVisibility(interaction.member)
  }

  if (interaction.customId === noteToggleCommentsCustomId) {
    await service.ensureCanUseNoteControls(interaction.member, interaction.channelId)
    return service.toggleComments(interaction.member)
  }

  if (interaction.customId === noteCloseCustomId) {
    await service.ensureCanUseNoteControls(interaction.member, interaction.channelId)
    return service.close(interaction.member, interaction.channelId)
  }

  return '不明なノート操作です。'
}

async function handleRenameButton(
  interaction: MessageComponentInteraction<'cached'>,
  service: NoteService
): Promise<void> {
  try {
    await service.ensureCanUseNoteControls(interaction.member, interaction.channelId)
    await interaction.showModal(createNoteRenameModal())
  } catch (error) {
    if (error instanceof NoteUserError) {
      await interaction.reply({ content: error.userMessage, flags: MessageFlags.Ephemeral })
      return
    }

    throw error
  }
}

async function handleBlockUserButton(
  interaction: MessageComponentInteraction<'cached'>,
  service: NoteService
): Promise<void> {
  try {
    await service.ensureCanUseNoteControls(interaction.member, interaction.channelId)
    await interaction.reply({
      content: 'このノートからブロックするユーザーを選択してください。',
      components: createNoteBlockUserActionRows(),
      flags: MessageFlags.Ephemeral
    })
  } catch (error) {
    if (error instanceof NoteUserError) {
      await interaction.reply({ content: error.userMessage, flags: MessageFlags.Ephemeral })
      return
    }

    throw error
  }
}

async function handleUnblockUserButton(
  interaction: MessageComponentInteraction<'cached'>,
  service: NoteService
): Promise<void> {
  try {
    await service.ensureCanUseNoteControls(interaction.member, interaction.channelId)
    await interaction.reply({
      content: 'このノートでブロック解除するユーザーを選択してください。',
      components: createNoteUnblockUserActionRows(),
      flags: MessageFlags.Ephemeral
    })
  } catch (error) {
    if (error instanceof NoteUserError) {
      await interaction.reply({ content: error.userMessage, flags: MessageFlags.Ephemeral })
      return
    }

    throw error
  }
}

async function handleUserSelect(
  interaction: MessageComponentInteraction<'cached'>,
  service: NoteService
): Promise<void> {
  if (!interaction.isUserSelectMenu()) {
    return
  }

  const targetUserId = interaction.values[0]

  if (!targetUserId) {
    await interaction.reply({
      content: 'ユーザーが選択されていません。',
      flags: MessageFlags.Ephemeral
    })
    return
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral })

  try {
    const content =
      interaction.customId === noteBlockUserSelectCustomId
        ? await service.blockUser(interaction.member, interaction.channelId, targetUserId)
        : interaction.customId === noteUnblockUserSelectCustomId
          ? await service.unblockUser(interaction.member, interaction.channelId, targetUserId)
          : '不明なノート操作です。'

    await interaction.editReply({ content, components: [] })
  } catch (error) {
    if (error instanceof NoteUserError) {
      await interaction.editReply({ content: error.userMessage, components: [] })
      return
    }

    throw error
  }
}

async function executeNoteModalSubmit(
  interaction: ModalSubmitInteraction,
  service: NoteService
): Promise<void> {
  if (interaction.customId !== noteRenameModalCustomId) {
    await interaction.reply({
      content: 'ノート操作の入力情報が不正です。',
      flags: MessageFlags.Ephemeral
    })
    return
  }

  if (!interaction.inCachedGuild()) {
    await interaction.reply({
      content: 'この操作はサーバー内でのみ実行できます。',
      flags: MessageFlags.Ephemeral
    })
    return
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral })

  try {
    const content = await service.rename(
      interaction.member,
      interaction.fields.getTextInputValue(noteRenameInputId)
    )
    await interaction.editReply({ content })
  } catch (error) {
    if (error instanceof NoteUserError) {
      await interaction.editReply({ content: error.userMessage })
      return
    }

    throw error
  }
}

function createNoteRenameModal(): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(noteRenameModalCustomId)
    .setTitle('ノート名を変更')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId(noteRenameInputId)
          .setLabel('新しいノート名')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(100)
      )
    )
}

function canBotManageNoteLobby(
  channel: NoteLobbyChannel,
  interaction: ChatInputCommandInteraction<'cached'>
): boolean {
  const clientUser = interaction.client.user

  if (!clientUser) {
    return true
  }

  const permissions = channel.permissionsFor(clientUser)

  return (
    permissions?.has([
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.ReadMessageHistory,
      PermissionFlagsBits.ManageChannels
    ]) ?? false
  )
}
