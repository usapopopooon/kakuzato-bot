import {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction
} from 'discord.js'
import type { DiscordCommand } from '../../../platform/discord/botModule'
import { defaultWelcomeMessageContent } from '../repositories/welcomeConfigRepository'
import { isWelcomeSendableChannel, type WelcomeService } from '../services/welcomeService'

const welcomePlaceholders = '{mention}, {username}, {displayName}, {guildName}, {memberCount}'
const maxWelcomeMessageLength = 1_500

export function createWelcomeCommand(service: WelcomeService): DiscordCommand {
  return {
    data: new SlashCommandBuilder()
      .setName('welcome')
      .setDescription('参加時のwelcome画像投稿を設定します')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .setDMPermission(false)
      .addSubcommand((subcommand) =>
        subcommand
          .setName('set')
          .setDescription('welcome画像の送信先チャンネルを設定します')
          .addChannelOption((option) =>
            option
              .setName('channel')
              .setDescription('welcome画像を送信するチャンネル')
              .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
              .setRequired(true)
          )
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName('message')
          .setDescription('welcome画像と一緒に送る本文を設定します')
          .addStringOption((option) =>
            option
              .setName('content')
              .setDescription(`本文。使用可能: ${welcomePlaceholders}`)
              .setMaxLength(maxWelcomeMessageLength)
              .setRequired(true)
          )
      )
      .addSubcommand((subcommand) =>
        subcommand.setName('disable').setDescription('welcome投稿を無効にします')
      )
      .addSubcommand((subcommand) =>
        subcommand.setName('status').setDescription('welcome設定を表示します')
      )
      .addSubcommand((subcommand) =>
        subcommand.setName('test').setDescription('設定済みチャンネルにテスト投稿します')
      ),
    execute: (interaction) => executeWelcomeCommand(interaction, service)
  }
}

async function executeWelcomeCommand(
  interaction: ChatInputCommandInteraction,
  service: WelcomeService
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

  if (subcommand === 'set') {
    await handleSet(interaction, service)
    return
  }

  if (subcommand === 'message') {
    await handleMessage(interaction, service)
    return
  }

  if (subcommand === 'disable') {
    await handleDisable(interaction, service)
    return
  }

  if (subcommand === 'status') {
    await handleStatus(interaction, service)
    return
  }

  if (subcommand === 'test') {
    await handleTest(interaction, service)
  }
}

async function handleSet(
  interaction: ChatInputCommandInteraction<'cached'>,
  service: WelcomeService
): Promise<void> {
  const selectedChannel = interaction.options.getChannel('channel', true)
  const channel = await interaction.guild.channels.fetch(selectedChannel.id).catch(() => null)

  if (!isWelcomeSendableChannel(channel)) {
    await interaction.reply({
      content: 'そのチャンネルにはwelcome画像を送信できません。',
      flags: MessageFlags.Ephemeral
    })
    return
  }

  if (!canBotSendWelcome(channel, interaction)) {
    await interaction.reply({
      content: 'そのチャンネルに送信する権限が Bot にありません。',
      flags: MessageFlags.Ephemeral
    })
    return
  }

  await service.setChannel(interaction.guildId, channel.id)
  await interaction.reply({
    content: `welcome画像の送信先を <#${channel.id}> に設定しました。`,
    flags: MessageFlags.Ephemeral
  })
}

async function handleMessage(
  interaction: ChatInputCommandInteraction<'cached'>,
  service: WelcomeService
): Promise<void> {
  const content = interaction.options.getString('content', true).trim()

  if (content.length === 0) {
    await interaction.reply({
      content: '本文は空にできません。',
      flags: MessageFlags.Ephemeral
    })
    return
  }

  const config = await service.setMessage(interaction.guildId, content)

  if (!config) {
    await interaction.reply({
      content: '先に `/welcome set` で送信先チャンネルを設定してください。',
      flags: MessageFlags.Ephemeral
    })
    return
  }

  await interaction.reply({
    content: `welcome本文を設定しました。\n${formatMessageContent(config.messageContent)}`,
    flags: MessageFlags.Ephemeral
  })
}

async function handleDisable(
  interaction: ChatInputCommandInteraction<'cached'>,
  service: WelcomeService
): Promise<void> {
  await service.disable(interaction.guildId)
  await interaction.reply({
    content: 'welcome投稿を無効にしました。',
    flags: MessageFlags.Ephemeral
  })
}

async function handleStatus(
  interaction: ChatInputCommandInteraction<'cached'>,
  service: WelcomeService
): Promise<void> {
  const config = await service.getConfig(interaction.guildId)

  if (!config?.enabled) {
    await interaction.reply({
      content: [
        'welcome投稿は無効です。',
        `デフォルト本文: ${formatMessageContent(defaultWelcomeMessageContent)}`,
        `使用可能なプレースホルダー: ${welcomePlaceholders}`
      ].join('\n'),
      flags: MessageFlags.Ephemeral
    })
    return
  }

  await interaction.reply({
    content: [
      `welcome投稿は有効です。送信先: <#${config.channelId}>`,
      `本文: ${formatMessageContent(config.messageContent)}`,
      `使用可能なプレースホルダー: ${welcomePlaceholders}`
    ].join('\n'),
    flags: MessageFlags.Ephemeral
  })
}

async function handleTest(
  interaction: ChatInputCommandInteraction<'cached'>,
  service: WelcomeService
): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral })

  const config = await service.getConfig(interaction.guildId)

  if (!config?.enabled) {
    await interaction.editReply({
      content: 'welcome投稿は無効です。先に `/welcome set` で送信先チャンネルを設定してください。'
    })
    return
  }

  const sent = await service.send(interaction.member)

  await interaction.editReply({
    content: sent
      ? 'welcomeのテスト投稿を送信しました。'
      : 'welcomeのテスト投稿を送信できませんでした。設定と Bot の送信権限を確認してください。'
  })
}

function canBotSendWelcome(
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
      PermissionFlagsBits.AttachFiles
    ]) ?? false
  )
}

function formatMessageContent(content: string): string {
  return content.length > 140 ? `${content.slice(0, 137)}...` : content
}
