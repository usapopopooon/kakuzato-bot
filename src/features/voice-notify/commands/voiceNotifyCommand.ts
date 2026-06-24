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

async function handleStatus(
  interaction: ChatInputCommandInteraction<'cached'>,
  service: VoiceNotifyService
): Promise<void> {
  const configs = await service.listConfigs(interaction.guildId)

  if (configs.length === 0) {
    await interaction.reply({
      content: 'VC入退室通知は設定されていません。',
      flags: MessageFlags.Ephemeral
    })
    return
  }

  const lines = configs
    .slice(0, statusListLimit)
    .map((config) => `・<#${config.voiceChannelId}> -> <#${config.notifyChannelId}>`)
  const omittedCount = configs.length - lines.length

  if (omittedCount > 0) {
    lines.push(`ほか ${omittedCount} 件`)
  }

  await interaction.reply({
    content: ['VC入退室通知の設定:', ...lines].join('\n'),
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
