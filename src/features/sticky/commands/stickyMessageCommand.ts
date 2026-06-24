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
  type ModalSubmitInteraction
} from 'discord.js'
import type { DiscordCommand, DiscordModalSubmitHandler } from '../../../platform/discord/botModule'
import {
  defaultStickyDelaySeconds,
  maxStickyDelaySeconds,
  minStickyDelaySeconds,
  normalizeStickyDelaySeconds,
  type StickyMessageConfig
} from '../repositories/stickyMessageRepository'
import {
  isStickySendableChannel,
  type StickyMessageService
} from '../services/stickyMessageService'

const stickyModalCustomIdPrefix = 'sticky-message:'
const stickyTextContentInputId = 'sticky-message-content'
const stickyEmbedTitleInputId = 'sticky-embed-title'
const stickyEmbedColorInputId = 'sticky-embed-color'
const stickyEmbedDescriptionInputId = 'sticky-embed-description'

type StickyMode = 'text' | 'embed'

type StickyModalPayload = {
  mode: StickyMode
  channelId: string
  delaySeconds: number
}

type StickyGuildInteraction =
  | ChatInputCommandInteraction<'cached'>
  | ModalSubmitInteraction<'cached'>

export function createStickyMessageCommand(service: StickyMessageService): DiscordCommand {
  return {
    data: new SlashCommandBuilder()
      .setName('sticky')
      .setDescription('チャンネル最新位置に固定表示するメッセージを設定します')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .setDMPermission(false)
      .addSubcommand((subcommand) =>
        subcommand
          .setName('text')
          .setDescription('テキスト形式のstickyメッセージを設定します')
          .addChannelOption((option) =>
            option
              .setName('channel')
              .setDescription('stickyメッセージを固定表示するチャンネル')
              .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
              .setRequired(true)
          )
          .addIntegerOption((option) =>
            option
              .setName('delay_seconds')
              .setDescription('最後の投稿から再表示までの秒数')
              .setMinValue(minStickyDelaySeconds)
              .setMaxValue(maxStickyDelaySeconds)
          )
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName('embed')
          .setDescription('Embed形式のstickyメッセージを設定します')
          .addChannelOption((option) =>
            option
              .setName('channel')
              .setDescription('stickyメッセージを固定表示するチャンネル')
              .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
              .setRequired(true)
          )
          .addIntegerOption((option) =>
            option
              .setName('delay_seconds')
              .setDescription('最後の投稿から再表示までの秒数')
              .setMinValue(minStickyDelaySeconds)
              .setMaxValue(maxStickyDelaySeconds)
          )
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName('remove')
          .setDescription('stickyメッセージを解除します')
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
          .setDescription('stickyメッセージ設定を表示します')
          .addChannelOption((option) =>
            option
              .setName('channel')
              .setDescription('確認するチャンネル')
              .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
              .setRequired(true)
          )
      ),
    execute: (interaction) => executeStickyMessageCommand(interaction, service)
  }
}

export function createStickyMessageModalSubmitHandler(
  service: StickyMessageService
): DiscordModalSubmitHandler {
  return {
    customIdPrefix: stickyModalCustomIdPrefix,
    execute: (interaction) => executeStickyMessageModalSubmit(interaction, service)
  }
}

async function executeStickyMessageCommand(
  interaction: ChatInputCommandInteraction,
  service: StickyMessageService
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

  if (subcommand === 'text') {
    await handleText(interaction)
    return
  }

  if (subcommand === 'embed') {
    await handleEmbed(interaction)
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

async function handleText(interaction: ChatInputCommandInteraction<'cached'>): Promise<void> {
  const selectedChannel = interaction.options.getChannel('channel', true)
  const channel = await fetchConfiguredChannel(interaction, selectedChannel.id, false)

  if (!channel) {
    return
  }

  const delaySeconds = getDelaySeconds(interaction)
  await interaction.showModal(createTextStickyModal(channel.id, delaySeconds))
}

async function handleEmbed(interaction: ChatInputCommandInteraction<'cached'>): Promise<void> {
  const selectedChannel = interaction.options.getChannel('channel', true)
  const channel = await fetchConfiguredChannel(interaction, selectedChannel.id, true)

  if (!channel) {
    return
  }

  const delaySeconds = getDelaySeconds(interaction)
  await interaction.showModal(createEmbedStickyModal(channel.id, delaySeconds))
}

async function handleRemove(
  interaction: ChatInputCommandInteraction<'cached'>,
  service: StickyMessageService
): Promise<void> {
  const selectedChannel = interaction.options.getChannel('channel', true)
  const channel = await fetchConfiguredChannel(interaction, selectedChannel.id, false, false)

  if (!channel) {
    return
  }

  const config = await service.remove(channel)

  await interaction.reply({
    content: config
      ? `stickyメッセージを <#${channel.id}> から解除しました。`
      : 'このチャンネルにはstickyメッセージが設定されていません。',
    flags: MessageFlags.Ephemeral
  })
}

async function handleStatus(
  interaction: ChatInputCommandInteraction<'cached'>,
  service: StickyMessageService
): Promise<void> {
  const selectedChannel = interaction.options.getChannel('channel', true)
  const config = await service.getConfig(selectedChannel.id)

  if (!config) {
    await interaction.reply({
      content: 'このチャンネルにはstickyメッセージが設定されていません。',
      flags: MessageFlags.Ephemeral
    })
    return
  }

  await interaction.reply({
    content: formatStickyStatus(config),
    flags: MessageFlags.Ephemeral
  })
}

async function fetchConfiguredChannel(
  interaction: StickyGuildInteraction,
  channelId: string,
  requiresEmbedLinks: boolean,
  checkPermissions = true
) {
  const channel = await interaction.guild.channels.fetch(channelId).catch(() => null)

  if (!isStickySendableChannel(channel)) {
    await interaction.reply({
      content: 'そのチャンネルにはstickyメッセージを送信できません。',
      flags: MessageFlags.Ephemeral
    })
    return undefined
  }

  if (checkPermissions && !canBotManageSticky(channel, interaction, requiresEmbedLinks)) {
    await interaction.reply({
      content: 'そのチャンネルでstickyメッセージを管理する権限が Bot にありません。',
      flags: MessageFlags.Ephemeral
    })
    return undefined
  }

  return channel
}

function canBotManageSticky(
  channel: unknown,
  interaction: StickyGuildInteraction,
  requiresEmbedLinks: boolean
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

  const requiredPermissions = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.ReadMessageHistory
  ]

  if (requiresEmbedLinks) {
    requiredPermissions.push(PermissionFlagsBits.EmbedLinks)
  }

  const permissions = (
    channel as {
      permissionsFor(user: unknown): { has(permissions: bigint[]): boolean } | null
    }
  ).permissionsFor(clientUser)

  return permissions?.has(requiredPermissions) ?? false
}

async function executeStickyMessageModalSubmit(
  interaction: ModalSubmitInteraction,
  service: StickyMessageService
): Promise<void> {
  const payload = parseStickyModalCustomId(interaction.customId)

  if (!payload) {
    await interaction.reply({
      content: 'stickyメッセージの入力情報が不正です。もう一度コマンドから設定してください。',
      flags: MessageFlags.Ephemeral
    })
    return
  }

  if (!interaction.inCachedGuild()) {
    await interaction.reply({
      content: 'この入力はサーバー内でのみ実行できます。',
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

  if (payload.mode === 'text') {
    await handleTextModalSubmit(interaction, service, payload)
    return
  }

  await handleEmbedModalSubmit(interaction, service, payload)
}

async function handleTextModalSubmit(
  interaction: ModalSubmitInteraction<'cached'>,
  service: StickyMessageService,
  payload: StickyModalPayload
): Promise<void> {
  const channel = await fetchConfiguredChannel(interaction, payload.channelId, false)

  if (!channel) {
    return
  }

  const content = normalizeStickyMessageInput(
    interaction.fields.getTextInputValue(stickyTextContentInputId)
  )

  if (content.length === 0) {
    await interaction.reply({
      content: '本文は空にできません。',
      flags: MessageFlags.Ephemeral
    })
    return
  }

  const config = await service.setText(interaction.guildId, channel, content, payload.delaySeconds)

  await interaction.reply({
    content: `stickyメッセージを <#${config.channelId}> に設定しました。種類: テキスト / 遅延: ${config.delaySeconds}秒`,
    flags: MessageFlags.Ephemeral
  })
}

async function handleEmbedModalSubmit(
  interaction: ModalSubmitInteraction<'cached'>,
  service: StickyMessageService,
  payload: StickyModalPayload
): Promise<void> {
  const channel = await fetchConfiguredChannel(interaction, payload.channelId, true)

  if (!channel) {
    return
  }

  const description = normalizeStickyMessageInput(
    interaction.fields.getTextInputValue(stickyEmbedDescriptionInputId)
  )

  if (description.length === 0) {
    await interaction.reply({
      content: '説明文は空にできません。',
      flags: MessageFlags.Ephemeral
    })
    return
  }

  const color = parseStickyColor(getOptionalModalTextValue(interaction, stickyEmbedColorInputId))

  if (color === 'invalid') {
    await interaction.reply({
      content: '色の形式が不正です。`FF0000`、`#00FF00`、`0x3366FF` のように指定してください。',
      flags: MessageFlags.Ephemeral
    })
    return
  }

  const config = await service.setEmbed(interaction.guildId, channel, {
    title: getOptionalModalTextValue(interaction, stickyEmbedTitleInputId).trim(),
    description,
    color,
    delaySeconds: payload.delaySeconds
  })

  await interaction.reply({
    content: `stickyメッセージを <#${config.channelId}> に設定しました。種類: Embed / 遅延: ${config.delaySeconds}秒`,
    flags: MessageFlags.Ephemeral
  })
}

function getDelaySeconds(interaction: ChatInputCommandInteraction<'cached'>): number {
  return normalizeStickyDelaySeconds(
    interaction.options.getInteger('delay_seconds') ?? defaultStickyDelaySeconds
  )
}

export function parseStickyColor(value: string | null): number | undefined | 'invalid' {
  if (!value || value.trim().length === 0) {
    return undefined
  }

  const normalized = value.trim().replace(/^#/u, '').replace(/^0x/iu, '')

  if (!/^[0-9a-f]{1,6}$/iu.test(normalized)) {
    return 'invalid'
  }

  return Number.parseInt(normalized, 16)
}

export function normalizeStickyMessageInput(value: string): string {
  return value.trim().replace(/\r\n|\r|\\r\\n|\\n|\\r/gu, '\n')
}

export function createStickyModalCustomId(
  mode: StickyMode,
  channelId: string,
  delaySeconds: number
): string {
  return `${stickyModalCustomIdPrefix}${mode}:${channelId}:${normalizeStickyDelaySeconds(
    delaySeconds
  )}`
}

export function parseStickyModalCustomId(customId: string): StickyModalPayload | undefined {
  if (!customId.startsWith(stickyModalCustomIdPrefix)) {
    return undefined
  }

  const [mode, channelId, delaySeconds] = customId
    .slice(stickyModalCustomIdPrefix.length)
    .split(':')

  if ((mode !== 'text' && mode !== 'embed') || !channelId || !delaySeconds) {
    return undefined
  }

  const parsedDelaySeconds = Number(delaySeconds)

  if (!Number.isFinite(parsedDelaySeconds)) {
    return undefined
  }

  return {
    mode,
    channelId,
    delaySeconds: normalizeStickyDelaySeconds(parsedDelaySeconds)
  }
}

function createTextStickyModal(channelId: string, delaySeconds: number): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(createStickyModalCustomId('text', channelId, delaySeconds))
    .setTitle('stickyテキストを設定')
    .addComponents(
      createTextInputRow(
        new TextInputBuilder()
          .setCustomId(stickyTextContentInputId)
          .setLabel('固定表示する本文')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(2_000)
      )
    )
}

function createEmbedStickyModal(channelId: string, delaySeconds: number): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(createStickyModalCustomId('embed', channelId, delaySeconds))
    .setTitle('sticky Embedを設定')
    .addComponents(
      createTextInputRow(
        new TextInputBuilder()
          .setCustomId(stickyEmbedTitleInputId)
          .setLabel('タイトル')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(256)
      ),
      createTextInputRow(
        new TextInputBuilder()
          .setCustomId(stickyEmbedColorInputId)
          .setLabel('色')
          .setPlaceholder('FF0000 / #00FF00 / 0x3366FF')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(8)
      ),
      createTextInputRow(
        new TextInputBuilder()
          .setCustomId(stickyEmbedDescriptionInputId)
          .setLabel('固定表示する説明文')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(4_000)
      )
    )
}

function createTextInputRow(input: TextInputBuilder): ActionRowBuilder<TextInputBuilder> {
  return new ActionRowBuilder<TextInputBuilder>().addComponents(input)
}

function getOptionalModalTextValue(interaction: ModalSubmitInteraction, customId: string): string {
  const field = interaction.fields.fields.get(customId)

  if (!field || !('value' in field) || typeof field.value !== 'string') {
    return ''
  }

  return field.value
}

function formatStickyStatus(config: StickyMessageConfig): string {
  const type = config.messageType === 'embed' ? 'Embed' : 'テキスト'
  const preview =
    config.description.length > 120 ? `${config.description.slice(0, 117)}...` : config.description
  const details = [
    `stickyメッセージは有効です。送信先: <#${config.channelId}>`,
    `種類: ${type}`,
    `遅延: ${config.delaySeconds}秒`,
    `内容: ${preview}`
  ]

  if (config.messageType === 'embed' && config.title.trim().length > 0) {
    details.splice(3, 0, `タイトル: ${config.title}`)
  }

  return details.join('\n')
}
