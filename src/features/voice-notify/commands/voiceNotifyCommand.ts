import {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction
} from 'discord.js'
import type { DiscordCommand } from '../../../platform/discord/botModule'
import {
  isVoiceNotifySendableChannel,
  type VoiceNotifyService
} from '../services/voiceNotifyService'

const statusListLimit = 20

export function createVoiceNotifyCommand(service: VoiceNotifyService): DiscordCommand {
  return {
    data: new SlashCommandBuilder()
      .setName('voice-notify')
      .setDescription('VC入退室通知を管理します')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .setDMPermission(false)
      .addSubcommand((subcommand) =>
        subcommand
          .setName('add')
          .setDescription('VC入退室通知を追加または更新します')
          .addChannelOption((option) =>
            option
              .setName('voice')
              .setDescription('入退室を通知するVC')
              .addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)
              .setRequired(true)
          )
          .addChannelOption((option) =>
            option
              .setName('notify')
              .setDescription('通知メッセージを送るチャンネル')
              .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
              .setRequired(true)
          )
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName('remove')
          .setDescription('VC入退室通知を解除します')
          .addChannelOption((option) =>
            option
              .setName('voice')
              .setDescription('通知を解除するVC')
              .addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)
              .setRequired(true)
          )
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName('add-category')
          .setDescription('カテゴリ内VCの入退室通知を追加または更新します')
          .addChannelOption((option) =>
            option
              .setName('category')
              .setDescription('入退室を通知するVCカテゴリ')
              .addChannelTypes(ChannelType.GuildCategory)
              .setRequired(true)
          )
          .addChannelOption((option) =>
            option
              .setName('notify')
              .setDescription('通知メッセージを送るチャンネル')
              .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
              .setRequired(true)
          )
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName('remove-category')
          .setDescription('カテゴリ内VCの入退室通知を解除します')
          .addChannelOption((option) =>
            option
              .setName('category')
              .setDescription('通知を解除するVCカテゴリ')
              .addChannelTypes(ChannelType.GuildCategory)
              .setRequired(true)
          )
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName('exclude-add')
          .setDescription('カテゴリ通知から除外するVCを追加します')
          .addChannelOption((option) =>
            option
              .setName('voice')
              .setDescription('カテゴリ通知から除外するVC')
              .addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)
              .setRequired(true)
          )
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName('exclude-remove')
          .setDescription('カテゴリ通知の除外VCを解除します')
          .addChannelOption((option) =>
            option
              .setName('voice')
              .setDescription('除外を解除するVC')
              .addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)
              .setRequired(true)
          )
      )
      .addSubcommand((subcommand) =>
        subcommand.setName('status').setDescription('VC入退室通知の設定を表示します')
      ),
    execute: (interaction) => executeVoiceNotifyCommand(interaction, service)
  }
}

async function executeVoiceNotifyCommand(
  interaction: ChatInputCommandInteraction,
  service: VoiceNotifyService
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

  if (subcommand === 'add') {
    await handleAdd(interaction, service)
    return
  }

  if (subcommand === 'remove') {
    await handleRemove(interaction, service)
    return
  }

  if (subcommand === 'add-category') {
    await handleAddCategory(interaction, service)
    return
  }

  if (subcommand === 'remove-category') {
    await handleRemoveCategory(interaction, service)
    return
  }

  if (subcommand === 'exclude-add') {
    await handleExcludeAdd(interaction, service)
    return
  }

  if (subcommand === 'exclude-remove') {
    await handleExcludeRemove(interaction, service)
    return
  }

  if (subcommand === 'status') {
    await handleStatus(interaction, service)
  }
}

async function handleAdd(
  interaction: ChatInputCommandInteraction<'cached'>,
  service: VoiceNotifyService
): Promise<void> {
  const selectedVoiceChannel = interaction.options.getChannel('voice', true)
  const selectedNotifyChannel = interaction.options.getChannel('notify', true)
  const voiceChannel = await interaction.guild.channels
    .fetch(selectedVoiceChannel.id)
    .catch(() => null)
  const notifyChannel = await interaction.guild.channels
    .fetch(selectedNotifyChannel.id)
    .catch(() => null)

  if (!isVoiceNotifyVoiceChannel(voiceChannel)) {
    await interaction.reply({
      content: 'そのVCは入退室通知の対象にできません。',
      flags: MessageFlags.Ephemeral
    })
    return
  }

  if (!isVoiceNotifySendableChannel(notifyChannel)) {
    await interaction.reply({
      content: 'そのチャンネルにはVC入退室通知を送信できません。',
      flags: MessageFlags.Ephemeral
    })
    return
  }

  if (!canBotSendVoiceNotify(notifyChannel, interaction)) {
    await interaction.reply({
      content: 'そのチャンネルに送信する権限が Bot にありません。',
      flags: MessageFlags.Ephemeral
    })
    return
  }

  await service.setConfig(interaction.guildId, voiceChannel.id, notifyChannel.id)
  await interaction.reply({
    content: [
      'VC入退室通知を設定しました。',
      `監視VC: <#${voiceChannel.id}>`,
      `通知先: <#${notifyChannel.id}>`
    ].join('\n'),
    flags: MessageFlags.Ephemeral
  })
}

async function handleAddCategory(
  interaction: ChatInputCommandInteraction<'cached'>,
  service: VoiceNotifyService
): Promise<void> {
  const selectedCategory = interaction.options.getChannel('category', true)
  const selectedNotifyChannel = interaction.options.getChannel('notify', true)
  const category = await interaction.guild.channels.fetch(selectedCategory.id).catch(() => null)
  const notifyChannel = await interaction.guild.channels
    .fetch(selectedNotifyChannel.id)
    .catch(() => null)

  if (!isVoiceNotifyCategoryChannel(category)) {
    await interaction.reply({
      content: 'そのカテゴリはVCカテゴリ通知の対象にできません。',
      flags: MessageFlags.Ephemeral
    })
    return
  }

  if (!isVoiceNotifySendableChannel(notifyChannel)) {
    await interaction.reply({
      content: 'そのチャンネルにはVC入退室通知を送信できません。',
      flags: MessageFlags.Ephemeral
    })
    return
  }

  if (!canBotSendVoiceNotify(notifyChannel, interaction)) {
    await interaction.reply({
      content: 'そのチャンネルに送信する権限が Bot にありません。',
      flags: MessageFlags.Ephemeral
    })
    return
  }

  await service.setCategoryConfig(interaction.guildId, category.id, notifyChannel.id)
  await interaction.reply({
    content: [
      'VCカテゴリ入退室通知を設定しました。',
      `監視カテゴリ: <#${category.id}>`,
      `通知先: <#${notifyChannel.id}>`
    ].join('\n'),
    flags: MessageFlags.Ephemeral
  })
}

async function handleRemove(
  interaction: ChatInputCommandInteraction<'cached'>,
  service: VoiceNotifyService
): Promise<void> {
  const selectedVoiceChannel = interaction.options.getChannel('voice', true)
  const removed = await service.deleteConfig(interaction.guildId, selectedVoiceChannel.id)

  await interaction.reply({
    content: removed
      ? `VC入退室通知を解除しました。監視VC: <#${selectedVoiceChannel.id}>`
      : `そのVCの入退室通知は設定されていません。監視VC: <#${selectedVoiceChannel.id}>`,
    flags: MessageFlags.Ephemeral
  })
}

async function handleRemoveCategory(
  interaction: ChatInputCommandInteraction<'cached'>,
  service: VoiceNotifyService
): Promise<void> {
  const selectedCategory = interaction.options.getChannel('category', true)
  const removed = await service.deleteCategoryConfig(interaction.guildId, selectedCategory.id)

  await interaction.reply({
    content: removed
      ? `VCカテゴリ入退室通知を解除しました。監視カテゴリ: <#${selectedCategory.id}>`
      : `そのカテゴリの入退室通知は設定されていません。監視カテゴリ: <#${selectedCategory.id}>`,
    flags: MessageFlags.Ephemeral
  })
}

async function handleExcludeAdd(
  interaction: ChatInputCommandInteraction<'cached'>,
  service: VoiceNotifyService
): Promise<void> {
  const selectedVoiceChannel = interaction.options.getChannel('voice', true)
  const voiceChannel = await interaction.guild.channels
    .fetch(selectedVoiceChannel.id)
    .catch(() => null)

  if (!isVoiceNotifyVoiceChannel(voiceChannel)) {
    await interaction.reply({
      content: 'そのVCはカテゴリ通知の除外対象にできません。',
      flags: MessageFlags.Ephemeral
    })
    return
  }

  await service.addExclude(interaction.guildId, voiceChannel.id)
  await interaction.reply({
    content: `カテゴリ通知の除外VCに追加しました。除外VC: <#${voiceChannel.id}>`,
    flags: MessageFlags.Ephemeral
  })
}

async function handleExcludeRemove(
  interaction: ChatInputCommandInteraction<'cached'>,
  service: VoiceNotifyService
): Promise<void> {
  const selectedVoiceChannel = interaction.options.getChannel('voice', true)
  const removed = await service.deleteExclude(interaction.guildId, selectedVoiceChannel.id)

  await interaction.reply({
    content: removed
      ? `カテゴリ通知の除外VCを解除しました。除外VC: <#${selectedVoiceChannel.id}>`
      : `そのVCはカテゴリ通知の除外対象に設定されていません。除外VC: <#${selectedVoiceChannel.id}>`,
    flags: MessageFlags.Ephemeral
  })
}

async function handleStatus(
  interaction: ChatInputCommandInteraction<'cached'>,
  service: VoiceNotifyService
): Promise<void> {
  const [configs, categoryConfigs, excludes] = await Promise.all([
    service.listConfigs(interaction.guildId),
    service.listCategoryConfigs(interaction.guildId),
    service.listExcludes(interaction.guildId)
  ])

  if (configs.length === 0 && categoryConfigs.length === 0 && excludes.length === 0) {
    await interaction.reply({
      content: 'VC入退室通知は設定されていません。',
      flags: MessageFlags.Ephemeral
    })
    return
  }

  const lines = ['VC入退室通知の設定:']
  const fixedLines = formatLimitedList(
    configs.map((config) => `・<#${config.voiceChannelId}> -> <#${config.notifyChannelId}>`)
  )
  const categoryLines = formatLimitedList(
    categoryConfigs.map((config) => `・<#${config.categoryId}> -> <#${config.notifyChannelId}>`)
  )
  const excludeLines = formatLimitedList(
    excludes.map((exclude) => `・<#${exclude.voiceChannelId}>`)
  )

  if (fixedLines.length > 0) {
    lines.push('固定VC:', ...fixedLines)
  }
  if (categoryLines.length > 0) {
    lines.push('カテゴリ:', ...categoryLines)
  }
  if (excludeLines.length > 0) {
    lines.push('カテゴリ通知の除外VC:', ...excludeLines)
  }

  await interaction.reply({
    content: lines.join('\n'),
    flags: MessageFlags.Ephemeral
  })
}

function isVoiceNotifyVoiceChannel(channel: unknown): channel is { id: string; type: ChannelType } {
  if (
    typeof channel !== 'object' ||
    channel === null ||
    !('id' in channel) ||
    typeof (channel as { id?: unknown }).id !== 'string' ||
    !('type' in channel)
  ) {
    return false
  }

  const type = (channel as { type?: unknown }).type

  return type === ChannelType.GuildVoice || type === ChannelType.GuildStageVoice
}

function isVoiceNotifyCategoryChannel(
  channel: unknown
): channel is { id: string; type: ChannelType } {
  if (
    typeof channel !== 'object' ||
    channel === null ||
    !('id' in channel) ||
    typeof (channel as { id?: unknown }).id !== 'string' ||
    !('type' in channel)
  ) {
    return false
  }

  return (channel as { type?: unknown }).type === ChannelType.GuildCategory
}

function formatLimitedList(lines: string[]): string[] {
  const limitedLines = lines.slice(0, statusListLimit)
  const omittedCount = lines.length - limitedLines.length

  if (omittedCount > 0) {
    limitedLines.push(`ほか ${omittedCount} 件`)
  }

  return limitedLines
}

function canBotSendVoiceNotify(
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
    permissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]) ?? false
  )
}
