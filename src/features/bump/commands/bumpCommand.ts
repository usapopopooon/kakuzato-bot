import {
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type SlashCommandSubcommandBuilder
} from 'discord.js'
import type { DiscordCommand } from '../../../platform/discord/botModule'
import {
  bumpServices,
  getBumpServiceByKey,
  isBumpServiceKey,
  type BumpServiceDefinition,
  type BumpServiceKey
} from '../bumpServices'
import type { BumpConfig, BumpReminder } from '../repositories/bumpRepository'
import { isBumpHistoryChannel, type BumpService } from '../services/bumpService'

const defaultEmbedColor = 0x85e7ad
const minReminderDelayMinutes = 1
const maxReminderDelayMinutes = 24 * 60

type BumpRoleDisplay = {
  name: string
  toString(): string
}

type BumpRoleDisplayGuild = {
  roles: {
    cache: {
      get(id: string): BumpRoleDisplay | undefined
    }
  }
}

export function createBumpCommand(service: BumpService): DiscordCommand {
  return {
    data: new SlashCommandBuilder()
      .setName('bump')
      .setDescription('DISBOARD/ディス速報の bump リマインダーを管理します')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .setDMPermission(false)
      .addSubcommand((subcommand) =>
        subcommand.setName('setup').setDescription('このチャンネルで bump 監視を開始します')
      )
      .addSubcommand((subcommand) =>
        subcommand.setName('status').setDescription('bump 監視設定を表示します')
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName('sync')
          .setDescription('監視チャンネル履歴から前回 bump を判定して次回通知を設定します')
      )
      .addSubcommand((subcommand) =>
        addBumpServiceOption(
          subcommand
            .setName('notify')
            .setDescription('サービスごとの bump 通知 ON/OFF を設定します')
        ).addBooleanOption((option) =>
          option.setName('enabled').setDescription('通知を有効にするか').setRequired(true)
        )
      )
      .addSubcommand((subcommand) =>
        addBumpServiceOption(
          subcommand.setName('delay').setDescription('サービスごとのリマインド時間を設定します')
        ).addIntegerOption((option) =>
          option
            .setName('minutes')
            .setDescription('bump 成功から通知までの分数')
            .setRequired(true)
            .setMinValue(minReminderDelayMinutes)
            .setMaxValue(maxReminderDelayMinutes)
        )
      )
      .addSubcommand((subcommand) =>
        addBumpServiceOption(
          subcommand.setName('role').setDescription('サービスごとの通知先ロールを設定します')
        ).addRoleOption((option) =>
          option.setName('role').setDescription('通知先ロール').setRequired(true)
        )
      )
      .addSubcommand((subcommand) =>
        addBumpServiceOption(
          subcommand
            .setName('role-reset')
            .setDescription('サービスごとの通知先ロールをデフォルトに戻します')
        )
      )
      .addSubcommand((subcommand) =>
        subcommand.setName('disable').setDescription('bump 監視を停止します')
      ),
    execute: (interaction) => executeBumpCommand(interaction, service)
  }
}

async function executeBumpCommand(
  interaction: ChatInputCommandInteraction,
  service: BumpService
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

  if (subcommand === 'status') {
    await handleStatus(interaction, service)
    return
  }

  if (subcommand === 'sync') {
    await handleSync(interaction, service)
    return
  }

  if (subcommand === 'notify') {
    await handleNotify(interaction, service)
    return
  }

  if (subcommand === 'delay') {
    await handleDelay(interaction, service)
    return
  }

  if (subcommand === 'role') {
    await handleRole(interaction, service)
    return
  }

  if (subcommand === 'role-reset') {
    await handleRoleReset(interaction, service)
    return
  }

  if (subcommand === 'disable') {
    await handleDisable(interaction, service)
  }
}

async function handleSetup(
  interaction: ChatInputCommandInteraction<'cached'>,
  service: BumpService
): Promise<void> {
  const channel = await fetchConfiguredChannel(interaction, interaction.channelId)

  if (!channel) {
    return
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral })
  const config = await service.setChannel(interaction.guildId, channel.id)
  const sync = await service.syncFromHistory(interaction.guild, channel)
  const reminders = await service.listRemindersByGuild(interaction.guildId)

  await interaction.editReply({
    embeds: [createBumpSetupEmbed(interaction.guild, config, reminders, sync.message)]
  })
}

async function handleStatus(
  interaction: ChatInputCommandInteraction<'cached'>,
  service: BumpService
): Promise<void> {
  const config = await service.getConfig(interaction.guildId)
  const reminders = await service.listRemindersByGuild(interaction.guildId)

  await interaction.reply({
    embeds: [createBumpStatusEmbed(interaction.guild, config, reminders)],
    flags: MessageFlags.Ephemeral
  })
}

async function handleSync(
  interaction: ChatInputCommandInteraction<'cached'>,
  service: BumpService
): Promise<void> {
  const config = await service.getConfig(interaction.guildId)

  if (!config) {
    await interaction.reply({
      content: 'bump 監視設定がありません。先に `/bump setup` を実行してください。',
      flags: MessageFlags.Ephemeral
    })
    return
  }

  const channel = await fetchConfiguredChannel(interaction, config.channelId)

  if (!channel) {
    return
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral })
  const sync = await service.syncFromHistory(interaction.guild, channel)

  await interaction.editReply({
    content: sync.message
  })
}

async function handleNotify(
  interaction: ChatInputCommandInteraction<'cached'>,
  service: BumpService
): Promise<void> {
  const serviceKey = getSelectedBumpServiceKey(interaction)
  const enabled = interaction.options.getBoolean('enabled', true)
  const reminder = await service.setReminderEnabled(interaction.guildId, serviceKey, enabled)
  const serviceDefinition = getBumpServiceByKey(serviceKey)

  await interaction.reply({
    content: `**${serviceDefinition?.name ?? serviceKey}** の通知を **${
      reminder.isEnabled ? '有効' : '無効'
    }** にしました。`,
    flags: MessageFlags.Ephemeral
  })
}

async function handleDelay(
  interaction: ChatInputCommandInteraction<'cached'>,
  service: BumpService
): Promise<void> {
  const serviceKey = getSelectedBumpServiceKey(interaction)
  const minutes = interaction.options.getInteger('minutes', true)
  const reminder = await service.setReminderDelayMinutes(interaction.guildId, serviceKey, minutes)
  const serviceDefinition = getBumpServiceByKey(serviceKey)

  await interaction.reply({
    content: `**${serviceDefinition?.name ?? serviceKey}** のリマインド時間を **${formatReminderDelay(
      reminder.reminderDelayMinutes
    )}** にしました。`,
    flags: MessageFlags.Ephemeral
  })
}

async function handleRole(
  interaction: ChatInputCommandInteraction<'cached'>,
  service: BumpService
): Promise<void> {
  const serviceKey = getSelectedBumpServiceKey(interaction)
  const role = interaction.options.getRole('role', true)
  const reminder = await service.setReminderRole(interaction.guildId, serviceKey, role.id)
  const serviceDefinition = getBumpServiceByKey(serviceKey)

  await interaction.reply({
    content: `**${serviceDefinition?.name ?? serviceKey}** の通知先を ${formatNotificationTarget(
      interaction.guild,
      reminder.roleId
    )} に変更しました。`,
    flags: MessageFlags.Ephemeral
  })
}

async function handleRoleReset(
  interaction: ChatInputCommandInteraction<'cached'>,
  service: BumpService
): Promise<void> {
  const serviceKey = getSelectedBumpServiceKey(interaction)
  const reminder = await service.setReminderRole(interaction.guildId, serviceKey, undefined)
  const serviceDefinition = getBumpServiceByKey(serviceKey)

  await interaction.reply({
    content: `**${serviceDefinition?.name ?? serviceKey}** の通知先を ${formatNotificationTarget(
      interaction.guild,
      reminder.roleId
    )} に戻しました。`,
    flags: MessageFlags.Ephemeral
  })
}

async function handleDisable(
  interaction: ChatInputCommandInteraction<'cached'>,
  service: BumpService
): Promise<void> {
  const deleted = await service.disable(interaction.guildId)

  await interaction.reply({
    content: deleted ? 'bump 監視を停止しました。' : 'bump 監視は既に無効です。',
    flags: MessageFlags.Ephemeral
  })
}

async function fetchConfiguredChannel(
  interaction: ChatInputCommandInteraction<'cached'>,
  channelId: string
) {
  const channel = await interaction.guild.channels.fetch(channelId).catch(() => null)

  if (!isBumpHistoryChannel(channel)) {
    await interaction.reply({
      content: 'このチャンネルでは bump 監視に必要なメッセージ送信・履歴取得ができません。',
      flags: MessageFlags.Ephemeral
    })
    return undefined
  }

  if (!canBotManageBump(channel, interaction)) {
    await interaction.reply({
      content: 'このチャンネルで bump 監視を行う権限が Bot にありません。',
      flags: MessageFlags.Ephemeral
    })
    return undefined
  }

  return channel
}

function canBotManageBump(
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
      PermissionFlagsBits.EmbedLinks,
      PermissionFlagsBits.ReadMessageHistory
    ]) ?? false
  )
}

function createBumpSetupEmbed(
  guild: BumpRoleDisplayGuild,
  config: BumpConfig,
  reminders: readonly BumpReminder[],
  syncMessage: string
): EmbedBuilder {
  const roleStatuses = bumpServices.map((service) => {
    const reminder = reminders.find((candidate) => candidate.serviceKey === service.key)
    return `・${service.name}: ${formatNotificationTarget(guild, reminder?.roleId)}`
  })
  const delayStatuses = bumpServices.map((service) => {
    const reminder = reminders.find((candidate) => candidate.serviceKey === service.key)
    return `・${service.name}: ${formatReminderDelay(
      reminder?.reminderDelayMinutes ?? service.defaultReminderDelayMinutes
    )}`
  })

  return new EmbedBuilder()
    .setTitle('Bump 監視を開始しました')
    .setDescription(
      [
        `監視チャンネル: <#${config.channelId}>`,
        '',
        '**通知先:**',
        ...roleStatuses,
        '',
        '**リマインド時間:**',
        ...delayStatuses,
        '',
        `監視対象サービス: ${bumpServices.map((service) => service.name).join(', ')}`,
        'bump 成功を検知し、設定した時間後にリマインドを送信します。',
        '',
        syncMessage
      ].join('\n')
    )
    .setColor(defaultEmbedColor)
    .setTimestamp(new Date())
    .setFooter({ text: 'Bump リマインダー' })
}

function createBumpStatusEmbed(
  guild: BumpRoleDisplayGuild,
  config: BumpConfig | undefined,
  reminders: readonly BumpReminder[]
): EmbedBuilder {
  if (!config) {
    return new EmbedBuilder()
      .setTitle('Bump 監視設定')
      .setDescription(
        'このサーバーでは bump 監視が設定されていません。\n\n`/bump setup` で設定してください。'
      )
      .setColor(defaultEmbedColor)
      .setFooter({ text: 'Bump リマインダー' })
  }

  const configuredAt = Math.trunc(new Date(config.createdAt).getTime() / 1_000)
  const serviceStatuses = bumpServices
    .map((service) =>
      formatServiceStatus(
        service,
        guild,
        reminders.find((reminder) => reminder.serviceKey === service.key)
      )
    )
    .join('\n')

  return new EmbedBuilder()
    .setTitle('Bump 監視設定')
    .setDescription(
      [
        `**監視チャンネル:** <#${config.channelId}>`,
        `**設定日時:** <t:${configuredAt}:F>`,
        '',
        '**サービス別ステータス:**',
        serviceStatuses
      ].join('\n')
    )
    .setColor(defaultEmbedColor)
    .setFooter({ text: 'Bump リマインダー' })
}

function formatServiceStatus(
  service: BumpServiceDefinition,
  guild: BumpRoleDisplayGuild,
  reminder: BumpReminder | undefined
): string {
  const targetDisplay = formatNotificationTarget(guild, reminder?.roleId)
  const notifyStatus = reminder ? (reminder.isEnabled ? '有効' : '無効') : '有効 (デフォルト)'
  const nextBump = formatNextBump(reminder?.remindAt)
  const delayMinutes = reminder?.reminderDelayMinutes ?? service.defaultReminderDelayMinutes

  return [
    `・${service.name}:`,
    `  通知: **${notifyStatus}**`,
    `  通知先: ${targetDisplay}`,
    `  リマインド時間: ${formatReminderDelay(delayMinutes)}`,
    `  次回 bump 可能時刻: ${nextBump}`
  ].join('\n')
}

function formatNotificationTarget(guild: BumpRoleDisplayGuild, roleId: string | undefined): string {
  if (roleId) {
    return guild.roles.cache.get(roleId)?.toString() ?? `<@&${roleId}>`
  }

  return 'メンションなし (デフォルト)'
}

function formatReminderDelay(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60

  if (hours > 0 && remainingMinutes > 0) {
    return `${hours}時間${remainingMinutes}分`
  }

  if (hours > 0) {
    return `${hours}時間`
  }

  return `${remainingMinutes}分`
}

function addBumpServiceOption(
  subcommand: SlashCommandSubcommandBuilder
): SlashCommandSubcommandBuilder {
  return subcommand.addStringOption((option) =>
    option
      .setName('service')
      .setDescription('対象サービス')
      .setRequired(true)
      .addChoices(...bumpServices.map((service) => ({ name: service.name, value: service.key })))
  )
}

function getSelectedBumpServiceKey(
  interaction: ChatInputCommandInteraction<'cached'>
): BumpServiceKey {
  const serviceKey = interaction.options.getString('service', true)

  if (!isBumpServiceKey(serviceKey)) {
    throw new Error(`Invalid bump service key: ${serviceKey}`)
  }

  return serviceKey
}

function formatNextBump(remindAt: string | undefined): string {
  if (!remindAt) {
    return '未設定'
  }

  const date = new Date(remindAt)
  const timestamp = Math.trunc(date.getTime() / 1_000)

  if (date > new Date()) {
    return `<t:${timestamp}:F> (<t:${timestamp}:R>)`
  }

  return `可能です (前回記録: <t:${timestamp}:F>)`
}
