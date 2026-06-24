import {
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type SlashCommandSubcommandBuilder
} from 'discord.js'
import type { DiscordCommand } from '../../../platform/discord/botModule'
import { AutoModAction, AutoModRuleType } from '../repositories/autoModRepository'
import {
  formatAutoModRuleStatus,
  isAutoModSendableChannel,
  type AutoModService
} from '../services/autoModService'
import { formatDuration } from '../services/autoModEmbeds'

const maxAccountAgeMinutes = 20_160
const maxTimeoutMinutes = 40_320

export function createAutoModCommand(service: AutoModService): DiscordCommand {
  return {
    data: new SlashCommandBuilder()
      .setName('automod')
      .setDescription('AutoMod のルールとログ送信先を管理します')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .setDMPermission(false)
      .addSubcommandGroup((group) =>
        group
          .setName('log')
          .setDescription('AutoMod ログ送信先を管理します')
          .addSubcommand((subcommand) =>
            subcommand
              .setName('set')
              .setDescription('AutoMod ログの送信先チャンネルを設定します')
              .addChannelOption((option) =>
                option
                  .setName('channel')
                  .setDescription('AutoMod ログを送信するチャンネル')
                  .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                  .setRequired(true)
              )
          )
          .addSubcommand((subcommand) =>
            subcommand.setName('disable').setDescription('AutoMod ログ送信を無効にします')
          )
      )
      .addSubcommandGroup((group) =>
        group
          .setName('no-avatar')
          .setDescription('アバター未設定ルールを管理します')
          .addSubcommand((subcommand) =>
            addActionOptions(
              subcommand
                .setName('set')
                .setDescription('アバター未設定ユーザーへの AutoMod を有効にします')
            )
          )
          .addSubcommand((subcommand) =>
            subcommand
              .setName('disable')
              .setDescription('アバター未設定ユーザーへの AutoMod を無効にします')
          )
      )
      .addSubcommandGroup((group) =>
        group
          .setName('account-age')
          .setDescription('アカウント作成期間ルールを管理します')
          .addSubcommand((subcommand) =>
            addActionOptions(
              subcommand
                .setName('set')
                .setDescription('作成から指定分数未満のアカウントへの AutoMod を有効にします')
                .addIntegerOption((option) =>
                  option
                    .setName('minutes')
                    .setDescription('アカウント作成からの最小経過分数。最大14日です')
                    .setMinValue(1)
                    .setMaxValue(maxAccountAgeMinutes)
                    .setRequired(true)
                )
            )
          )
          .addSubcommand((subcommand) =>
            subcommand.setName('disable').setDescription('アカウント作成期間ルールを無効にします')
          )
      )
      .addSubcommand((subcommand) =>
        subcommand.setName('status').setDescription('AutoMod 設定を表示します')
      ),
    execute: (interaction) => executeAutoModCommand(interaction, service)
  }
}

async function executeAutoModCommand(
  interaction: ChatInputCommandInteraction,
  service: AutoModService
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

  const group = interaction.options.getSubcommandGroup(false)
  const subcommand = interaction.options.getSubcommand()

  if (group === 'log' && subcommand === 'set') {
    await handleLogSet(interaction, service)
    return
  }

  if (group === 'log' && subcommand === 'disable') {
    await handleLogDisable(interaction, service)
    return
  }

  if (group === 'no-avatar' && subcommand === 'set') {
    await handleNoAvatarSet(interaction, service)
    return
  }

  if (group === 'no-avatar' && subcommand === 'disable') {
    await handleRuleDisable(interaction, service, AutoModRuleType.NO_AVATAR)
    return
  }

  if (group === 'account-age' && subcommand === 'set') {
    await handleAccountAgeSet(interaction, service)
    return
  }

  if (group === 'account-age' && subcommand === 'disable') {
    await handleRuleDisable(interaction, service, AutoModRuleType.ACCOUNT_AGE)
    return
  }

  if (!group && subcommand === 'status') {
    await handleStatus(interaction, service)
  }
}

function addActionOptions(
  subcommand: SlashCommandSubcommandBuilder
): SlashCommandSubcommandBuilder {
  return subcommand
    .addStringOption((option) =>
      option
        .setName('action')
        .setDescription('条件に一致した時の実行内容')
        .setRequired(true)
        .addChoices(
          { name: 'BAN', value: AutoModAction.BAN },
          { name: 'KICK', value: AutoModAction.KICK },
          { name: 'タイムアウト', value: AutoModAction.TIMEOUT }
        )
    )
    .addIntegerOption((option) =>
      option
        .setName('timeout_minutes')
        .setDescription('action がタイムアウトの場合の時間。省略時は60分です')
        .setMinValue(1)
        .setMaxValue(maxTimeoutMinutes)
        .setRequired(false)
    )
}

async function handleLogSet(
  interaction: ChatInputCommandInteraction<'cached'>,
  service: AutoModService
): Promise<void> {
  const selectedChannel = interaction.options.getChannel('channel', true)
  const channel = await interaction.guild.channels.fetch(selectedChannel.id).catch(() => null)

  if (!isAutoModSendableChannel(channel)) {
    await interaction.reply({
      content: 'そのチャンネルには AutoMod ログを送信できません。',
      flags: MessageFlags.Ephemeral
    })
    return
  }

  if (!canBotSendAutoModLog(channel, interaction)) {
    await interaction.reply({
      content: 'そのチャンネルに送信する権限が Bot にありません。',
      flags: MessageFlags.Ephemeral
    })
    return
  }

  await service.setLogChannel(interaction.guildId, channel.id)
  await interaction.reply({
    content: `AutoMod ログの送信先を <#${channel.id}> に設定しました。`,
    flags: MessageFlags.Ephemeral
  })
}

async function handleLogDisable(
  interaction: ChatInputCommandInteraction<'cached'>,
  service: AutoModService
): Promise<void> {
  await service.disableLogChannel(interaction.guildId)
  await interaction.reply({
    content: 'AutoMod ログ送信を無効にしました。DB への実行ログ保存は継続します。',
    flags: MessageFlags.Ephemeral
  })
}

async function handleNoAvatarSet(
  interaction: ChatInputCommandInteraction<'cached'>,
  service: AutoModService
): Promise<void> {
  const action = getActionOption(interaction)
  if (!(await ensureBotCanApplyAction(interaction, action))) {
    return
  }

  const timeoutDurationSeconds = getTimeoutDurationSeconds(interaction, action)
  const rule = await service.configureNoAvatar({
    guildId: interaction.guildId,
    action,
    timeoutDurationSeconds
  })

  await interaction.reply({
    content: `アバター未設定ルールを有効にしました。\n${formatAutoModRuleStatus(rule)}`,
    flags: MessageFlags.Ephemeral
  })
}

async function handleAccountAgeSet(
  interaction: ChatInputCommandInteraction<'cached'>,
  service: AutoModService
): Promise<void> {
  const minutes = interaction.options.getInteger('minutes', true)
  const action = getActionOption(interaction)
  if (!(await ensureBotCanApplyAction(interaction, action))) {
    return
  }

  const timeoutDurationSeconds = getTimeoutDurationSeconds(interaction, action)
  const thresholdSeconds = minutes * 60
  const rule = await service.configureAccountAge({
    guildId: interaction.guildId,
    thresholdSeconds,
    action,
    timeoutDurationSeconds
  })

  await interaction.reply({
    content: `アカウント作成期間ルールを有効にしました。\n閾値: ${formatDuration(
      thresholdSeconds
    )}\n${formatAutoModRuleStatus(rule)}`,
    flags: MessageFlags.Ephemeral
  })
}

async function handleRuleDisable(
  interaction: ChatInputCommandInteraction<'cached'>,
  service: AutoModService,
  ruleType: AutoModRuleType
): Promise<void> {
  const rule = await service.disableRule(interaction.guildId, ruleType)

  await interaction.reply({
    content: rule
      ? `${formatAutoModRuleStatus(rule)} を無効にしました。`
      : '対象ルールはまだ設定されていません。',
    flags: MessageFlags.Ephemeral
  })
}

async function handleStatus(
  interaction: ChatInputCommandInteraction<'cached'>,
  service: AutoModService
): Promise<void> {
  const [config, rules] = await Promise.all([
    service.getConfig(interaction.guildId),
    service.listRules(interaction.guildId)
  ])

  await interaction.reply({
    embeds: [createStatusEmbed(config?.logChannelId, rules)],
    flags: MessageFlags.Ephemeral
  })
}

function createStatusEmbed(
  logChannelId: string | undefined,
  rules: Awaited<ReturnType<AutoModService['listRules']>>
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle('AutoMod 設定')
    .setColor(0x85e7ad)
    .addFields({
      name: 'ログ送信先',
      value: logChannelId ? `<#${logChannelId}>` : '未設定 (DB 保存のみ)',
      inline: false
    })

  if (rules.length === 0) {
    embed.addFields({
      name: 'ルール',
      value: '未設定',
      inline: false
    })
    return embed
  }

  embed.addFields({
    name: 'ルール',
    value: rules.map(formatAutoModRuleStatus).join('\n'),
    inline: false
  })

  return embed
}

function getActionOption(interaction: ChatInputCommandInteraction<'cached'>): AutoModAction {
  const value = interaction.options.getString('action', true)

  if (
    value === AutoModAction.BAN ||
    value === AutoModAction.KICK ||
    value === AutoModAction.TIMEOUT
  ) {
    return value
  }

  return AutoModAction.BAN
}

function getTimeoutDurationSeconds(
  interaction: ChatInputCommandInteraction<'cached'>,
  action: AutoModAction
): number | undefined {
  if (action !== AutoModAction.TIMEOUT) {
    return undefined
  }

  return (interaction.options.getInteger('timeout_minutes') ?? 60) * 60
}

function canBotSendAutoModLog(
  channel: unknown,
  interaction: ChatInputCommandInteraction<'cached'>
): boolean {
  const clientUser = (interaction as { client?: { user?: unknown } }).client?.user

  if (
    typeof channel !== 'object' ||
    channel === null ||
    !('permissionsFor' in channel) ||
    typeof (channel as { permissionsFor?: unknown }).permissionsFor !== 'function' ||
    !clientUser
  ) {
    return true
  }

  const permissions = (
    channel as {
      permissionsFor(user: unknown): { has(permissions: bigint[]): boolean } | null
    }
  ).permissionsFor(clientUser)

  return (
    permissions?.has([
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.EmbedLinks
    ]) ?? false
  )
}

async function ensureBotCanApplyAction(
  interaction: ChatInputCommandInteraction<'cached'>,
  action: AutoModAction
): Promise<boolean> {
  const botMember = await interaction.guild.members
    .fetchMe()
    .catch(() => interaction.guild.members.me)

  if (!botMember) {
    await interaction.reply({
      content: 'Bot自身の権限を確認できませんでした。',
      flags: MessageFlags.Ephemeral
    })
    return false
  }

  const requiredPermission = getRequiredBotPermission(action)

  if (!botMember.permissions.has(requiredPermission)) {
    await interaction.reply({
      content: `この設定には Bot に ${getRequiredBotPermissionLabel(action)} 権限が必要です。`,
      flags: MessageFlags.Ephemeral
    })
    return false
  }

  return true
}

function getRequiredBotPermission(action: AutoModAction): bigint {
  if (action === AutoModAction.BAN) {
    return PermissionFlagsBits.BanMembers
  }
  if (action === AutoModAction.KICK) {
    return PermissionFlagsBits.KickMembers
  }

  return PermissionFlagsBits.ModerateMembers
}

function getRequiredBotPermissionLabel(action: AutoModAction): string {
  if (action === AutoModAction.BAN) {
    return 'メンバーをBAN'
  }
  if (action === AutoModAction.KICK) {
    return 'メンバーをキック'
  }

  return 'メンバーをタイムアウト'
}
