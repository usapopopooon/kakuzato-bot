import {
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type MessageComponentInteraction
} from 'discord.js'
import type { DiscordCommand, DiscordComponentHandler } from '../../../platform/discord/botModule'
import { bumpServices, getBumpServiceByKey, targetBumpRoleName } from '../bumpServices'
import type { BumpConfig, BumpReminder } from '../repositories/bumpRepository'
import {
  bumpComponentCustomIdPrefix,
  createBumpNotificationComponents,
  createBumpRoleSelectComponents,
  parseBumpComponentCustomId
} from '../services/bumpComponents'
import { isBumpHistoryChannel, type BumpService } from '../services/bumpService'

const defaultEmbedColor = 0x85e7ad

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
        subcommand
          .setName('sync-from-history')
          .setDescription('監視チャンネル履歴から前回 bump を判定して次回通知を設定します')
      )
      .addSubcommand((subcommand) =>
        subcommand.setName('disable').setDescription('bump 監視を停止します')
      ),
    execute: (interaction) => executeBumpCommand(interaction, service)
  }
}

export function createBumpComponentHandler(service: BumpService): DiscordComponentHandler {
  return {
    customIdPrefix: bumpComponentCustomIdPrefix,
    execute: (interaction) => executeBumpComponent(interaction, service)
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

  if (subcommand === 'sync' || subcommand === 'sync-from-history') {
    await handleSync(interaction, service)
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
    embeds: [createBumpSetupEmbed(config, sync.message)],
    components: createBumpManagementComponents(interaction.guildId, reminders)
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
    components: config ? createBumpManagementComponents(interaction.guildId, reminders) : [],
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
  const reminders = await service.listRemindersByGuild(interaction.guildId)

  await interaction.editReply({
    content: sync.message,
    components: createBumpManagementComponents(interaction.guildId, reminders)
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

async function executeBumpComponent(
  interaction: MessageComponentInteraction,
  service: BumpService
): Promise<void> {
  if (!interaction.inCachedGuild()) {
    await interaction.reply({
      content: 'この操作はサーバー内でのみ実行できます。',
      flags: MessageFlags.Ephemeral
    })
    return
  }

  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({
      content: 'この操作は管理者のみ実行できます。',
      flags: MessageFlags.Ephemeral
    })
    return
  }

  const payload = parseBumpComponentCustomId(interaction.customId)

  if (payload?.guildId !== interaction.guildId) {
    await interaction.reply({
      content: 'bump 通知設定の操作情報が不正です。',
      flags: MessageFlags.Ephemeral
    })
    return
  }

  if (payload.action === 'toggle') {
    const reminder = await service.toggleReminder(payload.guildId, payload.serviceKey)
    const reminders = await service.listRemindersByGuild(payload.guildId)
    const serviceDefinition = getBumpServiceByKey(payload.serviceKey)
    await interaction.update({
      components: createBumpManagementComponents(payload.guildId, reminders)
    })
    await interaction.followUp({
      content: `**${serviceDefinition?.name ?? payload.serviceKey}** の通知を **${
        reminder.isEnabled ? '有効' : '無効'
      }** にしました。`,
      flags: MessageFlags.Ephemeral
    })
    return
  }

  if (payload.action === 'role') {
    const serviceDefinition = getBumpServiceByKey(payload.serviceKey)
    await interaction.reply({
      content: `**${serviceDefinition?.name ?? payload.serviceKey}** の通知先ロールを選択してください。`,
      components: createBumpRoleSelectComponents(payload.guildId, payload.serviceKey),
      flags: MessageFlags.Ephemeral
    })
    return
  }

  if (payload.action === 'role-select') {
    if (!interaction.isRoleSelectMenu()) {
      await interaction.reply({
        content: 'ロール選択メニューから操作してください。',
        flags: MessageFlags.Ephemeral
      })
      return
    }

    const roleId = interaction.values[0]
    const role = interaction.guild.roles.cache.get(roleId)
    await service.setReminderRole(payload.guildId, payload.serviceKey, roleId)
    await interaction.update({
      content: `通知先ロールを **${role?.name ?? roleId}** に変更しました。`,
      components: []
    })
    return
  }

  await service.setReminderRole(payload.guildId, payload.serviceKey, undefined)
  await interaction.update({
    content: `通知先ロールを **${targetBumpRoleName}** (デフォルト) に戻しました。`,
    components: []
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

export function createBumpManagementComponents(
  guildId: string,
  reminders: readonly BumpReminder[]
) {
  return bumpServices.map((service) => {
    const reminder = reminders.find((candidate) => candidate.serviceKey === service.key)
    return createBumpNotificationComponents(guildId, service.key, reminder?.isEnabled ?? true)
  })
}

function createBumpSetupEmbed(config: BumpConfig, syncMessage: string): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle('Bump 監視を開始しました')
    .setDescription(
      [
        `監視チャンネル: <#${config.channelId}>`,
        `現在の通知先: \`@${targetBumpRoleName}\``,
        '',
        `監視対象サービス: ${bumpServices.map((service) => service.name).join(', ')}`,
        'bump 成功を検知し、2時間後にリマインドを送信します。',
        '',
        syncMessage
      ].join('\n')
    )
    .setColor(defaultEmbedColor)
    .setTimestamp(new Date())
    .setFooter({ text: 'Bump リマインダー' })
}

function createBumpStatusEmbed(
  guild: { roles: { cache: { get(id: string): { name: string } | undefined } } },
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
        service.name,
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
  serviceName: string,
  guild: { roles: { cache: { get(id: string): { name: string } | undefined } } },
  reminder: BumpReminder | undefined
): string {
  const roleDisplay = formatReminderRole(guild, reminder?.roleId)
  const notifyStatus = reminder ? (reminder.isEnabled ? '有効' : '無効') : '有効 (デフォルト)'
  const nextBump = formatNextBump(reminder?.remindAt)

  return [
    `・${serviceName}:`,
    `  通知: **${notifyStatus}**`,
    `  通知ロール: ${roleDisplay}`,
    `  次回bump可能時刻: ${nextBump}`
  ].join('\n')
}

function formatReminderRole(
  guild: { roles: { cache: { get(id: string): { name: string } | undefined } } },
  roleId: string | undefined
): string {
  if (!roleId) {
    return `\`@${targetBumpRoleName}\` (デフォルト)`
  }

  const role = guild.roles.cache.get(roleId)
  return role
    ? `\`@${role.name}\``
    : `\`@${targetBumpRoleName}\` (デフォルト, カスタムロール未解決)`
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
