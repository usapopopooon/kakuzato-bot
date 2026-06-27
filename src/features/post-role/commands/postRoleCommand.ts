import {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type Role
} from 'discord.js'
import type { DiscordCommand } from '../../../platform/discord/botModule'
import {
  defaultPostRoleHistoryLimit,
  formatPostRoleSyncResult,
  isPostRoleHistoryChannel,
  maxPostRoleHistoryLimit,
  minPostRoleHistoryLimit,
  type PostRoleService
} from '../services/postRoleService'

const statusListLimit = 20

export function createPostRoleCommand(service: PostRoleService): DiscordCommand {
  return {
    data: new SlashCommandBuilder()
      .setName('post-role')
      .setDescription('指定チャンネルへの投稿実績でロールを付与します')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .setDMPermission(false)
      .addSubcommand((subcommand) =>
        subcommand
          .setName('setup')
          .setDescription('投稿したメンバーにロールを付与するチャンネルを設定します')
          .addChannelOption((option) =>
            option
              .setName('channel')
              .setDescription('投稿を見張るチャンネル')
              .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
              .setRequired(true)
          )
          .addRoleOption((option) =>
            option
              .setName('role')
              .setDescription('投稿したメンバーへ付与するロール')
              .setRequired(true)
          )
          .addIntegerOption((option) =>
            option
              .setName('history_limit')
              .setDescription(`起動時/同期時に確認する過去メッセージ数（既定 ${defaultPostRoleHistoryLimit}）`)
              .setMinValue(minPostRoleHistoryLimit)
              .setMaxValue(maxPostRoleHistoryLimit)
          )
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName('remove')
          .setDescription('投稿実績ロールの設定を解除します')
          .addChannelOption((option) =>
            option
              .setName('channel')
              .setDescription('解除するチャンネル')
              .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
              .setRequired(true)
          )
      )
      .addSubcommand((subcommand) =>
        subcommand.setName('status').setDescription('投稿実績ロールの設定一覧を表示します')
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName('sync')
          .setDescription('過去ログを確認してロール付与を再実行します')
          .addChannelOption((option) =>
            option
              .setName('channel')
              .setDescription('同期するチャンネル。省略すると全設定を同期します')
              .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
          )
      ),
    execute: (interaction) => executePostRoleCommand(interaction, service)
  }
}

async function executePostRoleCommand(
  interaction: ChatInputCommandInteraction,
  service: PostRoleService
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

  if (subcommand === 'remove') {
    await handleRemove(interaction, service)
    return
  }

  if (subcommand === 'status') {
    await handleStatus(interaction, service)
    return
  }

  if (subcommand === 'sync') {
    await handleSync(interaction, service)
  }
}

async function handleSetup(
  interaction: ChatInputCommandInteraction<'cached'>,
  service: PostRoleService
): Promise<void> {
  const selectedChannel = interaction.options.getChannel('channel', true)
  const role = interaction.options.getRole('role', true)
  const channel = await interaction.guild.channels.fetch(selectedChannel.id).catch(() => null)

  if (!isPostRoleHistoryChannel(channel)) {
    await interaction.reply({
      content: '投稿実績ロールの対象には通常のテキストチャンネルを指定してください。',
      flags: MessageFlags.Ephemeral
    })
    return
  }

  if (!canBotReadHistory(channel, interaction)) {
    await interaction.reply({
      content: '対象チャンネルで Bot にチャンネル閲覧とメッセージ履歴閲覧の権限がありません。',
      flags: MessageFlags.Ephemeral
    })
    return
  }

  if (!canBotAssignRole(role, interaction)) {
    await interaction.reply({
      content: 'そのロールは Bot が付与できません。Bot のロール位置と「ロールの管理」権限を確認してください。',
      flags: MessageFlags.Ephemeral
    })
    return
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral })

  const config = await service.setConfig({
    guildId: interaction.guildId,
    channelId: channel.id,
    roleId: role.id,
    historyLimit: interaction.options.getInteger('history_limit') ?? undefined
  })
  const syncResult = await service.syncChannel(interaction.guild, channel.id)

  await interaction.editReply({
    content: [
      '投稿実績ロールを設定しました。',
      `対象: <#${config.channelId}>`,
      `付与ロール: <@&${config.roleId}>`,
      `履歴確認数: ${config.historyLimit}件`,
      '',
      '初回同期結果:',
      formatPostRoleSyncResult(syncResult)
    ].join('\n')
  })
}

async function handleRemove(
  interaction: ChatInputCommandInteraction<'cached'>,
  service: PostRoleService
): Promise<void> {
  const selectedChannel = interaction.options.getChannel('channel', true)
  const deleted = await service.remove(selectedChannel.id)

  await interaction.reply({
    content: deleted
      ? `投稿実績ロール設定を <#${selectedChannel.id}> から解除しました。既に付与済みのロールは残ります。`
      : 'そのチャンネルには投稿実績ロールが設定されていません。',
    flags: MessageFlags.Ephemeral
  })
}

async function handleStatus(
  interaction: ChatInputCommandInteraction<'cached'>,
  service: PostRoleService
): Promise<void> {
  const configs = await service.listByGuild(interaction.guildId)

  if (configs.length === 0) {
    await interaction.reply({
      content: '投稿実績ロールは設定されていません。',
      flags: MessageFlags.Ephemeral
    })
    return
  }

  const lines = configs.slice(0, statusListLimit).map((config, index) =>
    [
      `${index + 1}. <#${config.channelId}>`,
      `ロール: <@&${config.roleId}>`,
      `履歴確認数: ${config.historyLimit}件`
    ].join(' / ')
  )

  if (configs.length > statusListLimit) {
    lines.push(`...ほか ${configs.length - statusListLimit}件`)
  }

  await interaction.reply({
    content: ['投稿実績ロール設定:', ...lines].join('\n'),
    flags: MessageFlags.Ephemeral
  })
}

async function handleSync(
  interaction: ChatInputCommandInteraction<'cached'>,
  service: PostRoleService
): Promise<void> {
  const selectedChannel = interaction.options.getChannel('channel')

  await interaction.deferReply({ flags: MessageFlags.Ephemeral })

  const result = selectedChannel
    ? await service.syncChannel(interaction.guild, selectedChannel.id)
    : await service.syncGuild(interaction.guild)

  await interaction.editReply({
    content:
      result.configs === 0
        ? '同期対象の投稿実績ロール設定がありません。'
        : ['投稿実績ロールの履歴同期が完了しました。', formatPostRoleSyncResult(result)].join('\n')
  })
}

function canBotReadHistory(
  channel: Parameters<typeof isPostRoleHistoryChannel>[0],
  interaction: ChatInputCommandInteraction<'cached'>
): boolean {
  const clientUser = interaction.client.user

  if (!clientUser || !isPostRoleHistoryChannel(channel)) {
    return false
  }

  const permissions = channel.permissionsFor(clientUser)

  return (
    permissions?.has([
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.ReadMessageHistory
    ]) ?? false
  )
}

function canBotAssignRole(
  role: Role,
  interaction: ChatInputCommandInteraction<'cached'>
): boolean {
  if (role.id === interaction.guildId || role.managed || !role.editable) {
    return false
  }

  return interaction.guild.members.me?.permissions.has(PermissionFlagsBits.ManageRoles) ?? false
}
