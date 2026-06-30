import {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction
} from 'discord.js'
import type { DiscordCommand } from '../../../platform/discord/botModule'
import type { AutoReactionConfig } from '../repositories/autoReactionRepository'
import {
  isAutoReactionChannel,
  maxAutoReactionEmojiLength,
  maxAutoReactionEmojis,
  maxAutoReactionInputLength,
  parseAutoReactionEmojis,
  type AutoReactionChannel,
  type AutoReactionService
} from '../services/autoReactionService'

const statusListLimit = 20

export function createAutoReactionCommand(service: AutoReactionService): DiscordCommand {
  return {
    data: new SlashCommandBuilder()
      .setName('auto-reaction')
      .setDescription('指定チャンネルの投稿へ自動でリアクションを付けます')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .setDMPermission(false)
      .addSubcommand((subcommand) =>
        subcommand
          .setName('setup')
          .setDescription('投稿へ付けるリアクションを設定します')
          .addChannelOption((option) =>
            option
              .setName('channel')
              .setDescription('リアクションを付ける投稿チャンネル')
              .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
              .setRequired(true)
          )
          .addStringOption((option) =>
            option
              .setName('emojis')
              .setDescription('付与するリアクション（スペース/カンマ区切り、最大20個）')
              .setRequired(true)
              .setMaxLength(maxAutoReactionInputLength)
          )
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName('remove')
          .setDescription('自動リアクション設定を解除します')
          .addChannelOption((option) =>
            option
              .setName('channel')
              .setDescription('解除するチャンネル')
              .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
              .setRequired(true)
          )
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName('status')
          .setDescription('自動リアクション設定を表示します')
          .addChannelOption((option) =>
            option
              .setName('channel')
              .setDescription('確認するチャンネル。省略すると全設定を表示します')
              .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
          )
      ),
    execute: (interaction) => executeAutoReactionCommand(interaction, service)
  }
}

async function executeAutoReactionCommand(
  interaction: ChatInputCommandInteraction,
  service: AutoReactionService
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
  }
}

async function handleSetup(
  interaction: ChatInputCommandInteraction<'cached'>,
  service: AutoReactionService
): Promise<void> {
  const selectedChannel = interaction.options.getChannel('channel', true)
  const parsed = parseAutoReactionEmojis(interaction.options.getString('emojis', true))

  if (parsed.tooLong.length > 0) {
    await interaction.reply({
      content: `1つのリアクション指定は ${maxAutoReactionEmojiLength} 文字以内にしてください。`,
      flags: MessageFlags.Ephemeral
    })
    return
  }

  if (parsed.tooMany) {
    await interaction.reply({
      content: `リアクションは最大 ${maxAutoReactionEmojis} 個まで指定できます。`,
      flags: MessageFlags.Ephemeral
    })
    return
  }

  if (parsed.emojis.length === 0) {
    await interaction.reply({
      content: 'リアクションを1個以上指定してください。',
      flags: MessageFlags.Ephemeral
    })
    return
  }

  const channel = await interaction.guild.channels.fetch(selectedChannel.id).catch(() => null)

  if (!isAutoReactionChannel(channel)) {
    await interaction.reply({
      content: '自動リアクションの対象には通常のテキストチャンネルを指定してください。',
      flags: MessageFlags.Ephemeral
    })
    return
  }

  if (!canBotReactInChannel(channel, interaction)) {
    await interaction.reply({
      content: '対象チャンネルで Bot にチャンネル閲覧とリアクション追加の権限がありません。',
      flags: MessageFlags.Ephemeral
    })
    return
  }

  const config = await service.setConfig({
    guildId: interaction.guildId,
    channelId: channel.id,
    emojis: parsed.emojis
  })

  await interaction.reply({
    content: ['自動リアクションを設定しました。', formatAutoReactionConfig(config)].join('\n'),
    flags: MessageFlags.Ephemeral
  })
}

async function handleRemove(
  interaction: ChatInputCommandInteraction<'cached'>,
  service: AutoReactionService
): Promise<void> {
  const selectedChannel = interaction.options.getChannel('channel', true)
  const deleted = await service.remove(selectedChannel.id)

  await interaction.reply({
    content: deleted
      ? `自動リアクション設定を <#${selectedChannel.id}> から解除しました。`
      : 'そのチャンネルには自動リアクションが設定されていません。',
    flags: MessageFlags.Ephemeral
  })
}

async function handleStatus(
  interaction: ChatInputCommandInteraction<'cached'>,
  service: AutoReactionService
): Promise<void> {
  const selectedChannel = interaction.options.getChannel('channel')

  if (selectedChannel) {
    const config = await service.getConfig(selectedChannel.id)

    await interaction.reply({
      content: config
        ? formatAutoReactionConfig(config)
        : 'そのチャンネルには自動リアクションが設定されていません。',
      flags: MessageFlags.Ephemeral
    })
    return
  }

  const configs = await service.listByGuild(interaction.guildId)

  if (configs.length === 0) {
    await interaction.reply({
      content: '自動リアクションは設定されていません。',
      flags: MessageFlags.Ephemeral
    })
    return
  }

  const lines = configs
    .slice(0, statusListLimit)
    .map((config, index) => `${index + 1}. ${formatAutoReactionConfig(config)}`)

  if (configs.length > statusListLimit) {
    lines.push(`...ほか ${configs.length - statusListLimit}件`)
  }

  await interaction.reply({
    content: ['自動リアクション設定:', ...lines].join('\n'),
    flags: MessageFlags.Ephemeral
  })
}

function canBotReactInChannel(
  channel: AutoReactionChannel,
  interaction: ChatInputCommandInteraction<'cached'>
): boolean {
  const clientUser = interaction.client.user

  if (!clientUser) {
    return false
  }

  const permissions = channel.permissionsFor(clientUser)

  return (
    permissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.AddReactions]) ?? false
  )
}

function formatAutoReactionConfig(config: AutoReactionConfig): string {
  return [`対象: <#${config.channelId}>`, `リアクション: ${formatEmojis(config.emojis)}`].join('\n')
}

function formatEmojis(emojis: string[]): string {
  return emojis.length > 0 ? emojis.join(' ') : '(なし)'
}
