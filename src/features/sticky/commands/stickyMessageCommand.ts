import {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction
} from "discord.js";
import type { DiscordCommand } from "../../../platform/discord/botModule";
import {
  defaultStickyDelaySeconds,
  maxStickyDelaySeconds,
  minStickyDelaySeconds,
  normalizeStickyDelaySeconds,
  type StickyMessageConfig
} from "../repositories/stickyMessageRepository";
import {
  isStickySendableChannel,
  type StickyMessageService
} from "../services/stickyMessageService";

export function createStickyMessageCommand(service: StickyMessageService): DiscordCommand {
  return {
    data: new SlashCommandBuilder()
      .setName("sticky")
      .setDescription("チャンネル最新位置に固定表示するメッセージを設定します")
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .setDMPermission(false)
      .addSubcommand((subcommand) =>
        subcommand
          .setName("text")
          .setDescription("テキスト形式のstickyメッセージを設定します")
          .addChannelOption((option) =>
            option
              .setName("channel")
              .setDescription("stickyメッセージを固定表示するチャンネル")
              .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
              .setRequired(true)
          )
          .addStringOption((option) =>
            option
              .setName("content")
              .setDescription("固定表示する本文。改行は \\n")
              .setMaxLength(2_000)
              .setRequired(true)
          )
          .addIntegerOption((option) =>
            option
              .setName("delay_seconds")
              .setDescription("最後の投稿から再表示までの秒数")
              .setMinValue(minStickyDelaySeconds)
              .setMaxValue(maxStickyDelaySeconds)
          )
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName("embed")
          .setDescription("Embed形式のstickyメッセージを設定します")
          .addChannelOption((option) =>
            option
              .setName("channel")
              .setDescription("stickyメッセージを固定表示するチャンネル")
              .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
              .setRequired(true)
          )
          .addStringOption((option) =>
            option
              .setName("description")
              .setDescription("固定表示する説明文。改行は \\n")
              .setMaxLength(4_000)
              .setRequired(true)
          )
          .addStringOption((option) =>
            option.setName("title").setDescription("Embedタイトル").setMaxLength(256)
          )
          .addStringOption((option) =>
            option.setName("color").setDescription("Embed色。例: FF0000 または #00FF00")
          )
          .addIntegerOption((option) =>
            option
              .setName("delay_seconds")
              .setDescription("最後の投稿から再表示までの秒数")
              .setMinValue(minStickyDelaySeconds)
              .setMaxValue(maxStickyDelaySeconds)
          )
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName("remove")
          .setDescription("stickyメッセージを解除します")
          .addChannelOption((option) =>
            option
              .setName("channel")
              .setDescription("解除するチャンネル")
              .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
              .setRequired(true)
          )
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName("status")
          .setDescription("stickyメッセージ設定を表示します")
          .addChannelOption((option) =>
            option
              .setName("channel")
              .setDescription("確認するチャンネル")
              .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
              .setRequired(true)
          )
      ),
    execute: (interaction) => executeStickyMessageCommand(interaction, service)
  };
}

async function executeStickyMessageCommand(
  interaction: ChatInputCommandInteraction,
  service: StickyMessageService
): Promise<void> {
  if (!interaction.inCachedGuild()) {
    await interaction.reply({
      content: "このコマンドはサーバー内でのみ実行できます。",
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({
      content: "このコマンドは管理者のみ実行できます。",
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  const subcommand = interaction.options.getSubcommand();

  if (subcommand === "text") {
    await handleText(interaction, service);
    return;
  }

  if (subcommand === "embed") {
    await handleEmbed(interaction, service);
    return;
  }

  if (subcommand === "remove") {
    await handleRemove(interaction, service);
    return;
  }

  if (subcommand === "status") {
    await handleStatus(interaction, service);
  }
}

async function handleText(
  interaction: ChatInputCommandInteraction<"cached">,
  service: StickyMessageService
): Promise<void> {
  const channel = await getConfiguredChannel(interaction, false);

  if (!channel) {
    return;
  }

  const content = normalizeStickyMessageInput(interaction.options.getString("content", true));

  if (content.length === 0) {
    await interaction.reply({
      content: "本文は空にできません。",
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  const delaySeconds = getDelaySeconds(interaction);
  const config = await service.setText(interaction.guildId, channel, content, delaySeconds);

  await interaction.reply({
    content: `stickyメッセージを <#${config.channelId}> に設定しました。種類: テキスト / 遅延: ${config.delaySeconds}秒`,
    flags: MessageFlags.Ephemeral
  });
}

async function handleEmbed(
  interaction: ChatInputCommandInteraction<"cached">,
  service: StickyMessageService
): Promise<void> {
  const channel = await getConfiguredChannel(interaction, true);

  if (!channel) {
    return;
  }

  const description = normalizeStickyMessageInput(
    interaction.options.getString("description", true)
  );

  if (description.length === 0) {
    await interaction.reply({
      content: "説明文は空にできません。",
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  const color = parseStickyColor(interaction.options.getString("color"));

  if (color === "invalid") {
    await interaction.reply({
      content: "色の形式が不正です。`FF0000`、`#00FF00`、`0x3366FF` のように指定してください。",
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  const title = interaction.options.getString("title")?.trim() ?? "";
  const delaySeconds = getDelaySeconds(interaction);
  const config = await service.setEmbed(interaction.guildId, channel, {
    title,
    description,
    color,
    delaySeconds
  });

  await interaction.reply({
    content: `stickyメッセージを <#${config.channelId}> に設定しました。種類: Embed / 遅延: ${config.delaySeconds}秒`,
    flags: MessageFlags.Ephemeral
  });
}

async function handleRemove(
  interaction: ChatInputCommandInteraction<"cached">,
  service: StickyMessageService
): Promise<void> {
  const channel = await getConfiguredChannel(interaction, false, false);

  if (!channel) {
    return;
  }

  const config = await service.remove(channel);

  await interaction.reply({
    content: config
      ? `stickyメッセージを <#${channel.id}> から解除しました。`
      : `このチャンネルにはstickyメッセージが設定されていません。`,
    flags: MessageFlags.Ephemeral
  });
}

async function handleStatus(
  interaction: ChatInputCommandInteraction<"cached">,
  service: StickyMessageService
): Promise<void> {
  const selectedChannel = interaction.options.getChannel("channel", true);
  const config = await service.getConfig(selectedChannel.id);

  if (!config) {
    await interaction.reply({
      content: "このチャンネルにはstickyメッセージが設定されていません。",
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  await interaction.reply({
    content: formatStickyStatus(config),
    flags: MessageFlags.Ephemeral
  });
}

async function getConfiguredChannel(
  interaction: ChatInputCommandInteraction<"cached">,
  requiresEmbedLinks: boolean,
  checkPermissions = true
) {
  const selectedChannel = interaction.options.getChannel("channel", true);
  const channel = await interaction.guild.channels.fetch(selectedChannel.id).catch(() => null);

  if (!isStickySendableChannel(channel)) {
    await interaction.reply({
      content: "そのチャンネルにはstickyメッセージを送信できません。",
      flags: MessageFlags.Ephemeral
    });
    return undefined;
  }

  if (checkPermissions && !canBotManageSticky(channel, interaction, requiresEmbedLinks)) {
    await interaction.reply({
      content: "そのチャンネルでstickyメッセージを管理する権限が Bot にありません。",
      flags: MessageFlags.Ephemeral
    });
    return undefined;
  }

  return channel;
}

function canBotManageSticky(
  channel: unknown,
  interaction: ChatInputCommandInteraction<"cached">,
  requiresEmbedLinks: boolean
): boolean {
  const clientUser = (interaction as { client?: { user?: unknown } }).client?.user;

  if (
    typeof channel !== "object" ||
    channel === null ||
    !("permissionsFor" in channel) ||
    typeof (channel as { permissionsFor?: unknown }).permissionsFor !== "function" ||
    !clientUser
  ) {
    return true;
  }

  const requiredPermissions = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.ReadMessageHistory
  ];

  if (requiresEmbedLinks) {
    requiredPermissions.push(PermissionFlagsBits.EmbedLinks);
  }

  const permissions = (
    channel as {
      permissionsFor(user: unknown): { has(permissions: bigint[]): boolean } | null;
    }
  ).permissionsFor(clientUser);

  return permissions?.has(requiredPermissions) ?? false;
}

function getDelaySeconds(interaction: ChatInputCommandInteraction<"cached">): number {
  return normalizeStickyDelaySeconds(
    interaction.options.getInteger("delay_seconds") ?? defaultStickyDelaySeconds
  );
}

export function parseStickyColor(value: string | null): number | undefined | "invalid" {
  if (!value || value.trim().length === 0) {
    return undefined;
  }

  const normalized = value.trim().replace(/^#/u, "").replace(/^0x/iu, "");

  if (!/^[0-9a-f]{1,6}$/iu.test(normalized)) {
    return "invalid";
  }

  return Number.parseInt(normalized, 16);
}

export function normalizeStickyMessageInput(value: string): string {
  return value.trim().replace(/\r\n|\r|\\r\\n|\\n|\\r/gu, "\n");
}

function formatStickyStatus(config: StickyMessageConfig): string {
  const type = config.messageType === "embed" ? "Embed" : "テキスト";
  const preview =
    config.description.length > 120 ? `${config.description.slice(0, 117)}...` : config.description;
  const details = [
    `stickyメッセージは有効です。送信先: <#${config.channelId}>`,
    `種類: ${type}`,
    `遅延: ${config.delaySeconds}秒`,
    `内容: ${preview}`
  ];

  if (config.messageType === "embed" && config.title.trim().length > 0) {
    details.splice(3, 0, `タイトル: ${config.title}`);
  }

  return details.join("\n");
}
