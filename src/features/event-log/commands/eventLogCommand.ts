import {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction
} from "discord.js";
import type { DiscordCommand } from "../../../platform/discord/botModule";
import {
  eventLogCategories,
  eventLogCategoryLabels,
  isEventLogCategory
} from "../eventLogCategories";
import { createLogEmbed } from "../services/eventLogEmbeds";
import { isEventLogSendableChannel, type EventLogService } from "../services/eventLogService";

export function createEventLogCommand(service: EventLogService): DiscordCommand {
  return {
    data: new SlashCommandBuilder()
      .setName("eventlog")
      .setDescription("イベントログの送信先を設定します")
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .setDMPermission(false)
      .addSubcommand((subcommand) =>
        subcommand
          .setName("set")
          .setDescription("イベントログの送信先チャンネルを設定します")
          .addChannelOption((option) =>
            option
              .setName("channel")
              .setDescription("イベントログを送信するチャンネル")
              .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
              .setRequired(true)
          )
      )
      .addSubcommand((subcommand) =>
        subcommand.setName("disable").setDescription("イベントログを無効にします")
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName("category")
          .setDescription("カテゴリ単位でイベントログの送信を切り替えます")
          .addStringOption((option) =>
            option
              .setName("category")
              .setDescription("切り替えるカテゴリ")
              .setRequired(true)
              .addChoices(
                ...eventLogCategories.map((category) => ({
                  name: eventLogCategoryLabels[category],
                  value: category
                }))
              )
          )
          .addBooleanOption((option) =>
            option
              .setName("enabled")
              .setDescription("有効にする場合は true、無効にする場合は false")
              .setRequired(true)
          )
      )
      .addSubcommand((subcommand) =>
        subcommand.setName("status").setDescription("イベントログ設定を表示します")
      )
      .addSubcommand((subcommand) =>
        subcommand.setName("test").setDescription("設定済みチャンネルにテストログを送信します")
      ),
    execute: (interaction) => executeEventLogCommand(interaction, service)
  };
}

async function executeEventLogCommand(
  interaction: ChatInputCommandInteraction,
  service: EventLogService
): Promise<void> {
  if (!interaction.inCachedGuild()) {
    await interaction.reply({
      content: "このコマンドはサーバー内でのみ実行できます。",
      ephemeral: true
    });
    return;
  }

  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({
      content: "このコマンドは管理者のみ実行できます。",
      ephemeral: true
    });
    return;
  }

  const subcommand = interaction.options.getSubcommand();

  if (subcommand === "set") {
    await handleSet(interaction, service);
    return;
  }

  if (subcommand === "disable") {
    await handleDisable(interaction, service);
    return;
  }

  if (subcommand === "category") {
    await handleCategory(interaction, service);
    return;
  }

  if (subcommand === "status") {
    await handleStatus(interaction, service);
    return;
  }

  if (subcommand === "test") {
    await handleTest(interaction, service);
  }
}

async function handleSet(
  interaction: ChatInputCommandInteraction<"cached">,
  service: EventLogService
): Promise<void> {
  const selectedChannel = interaction.options.getChannel("channel", true);
  const channel = await interaction.guild.channels.fetch(selectedChannel.id).catch(() => null);

  if (!isEventLogSendableChannel(channel)) {
    await interaction.reply({
      content: "そのチャンネルにはイベントログを送信できません。",
      ephemeral: true
    });
    return;
  }

  if (!canBotSendEventLog(channel, interaction)) {
    await interaction.reply({
      content: "そのチャンネルに送信する権限が Bot にありません。",
      ephemeral: true
    });
    return;
  }

  await service.setChannel(interaction.guildId, channel.id);
  await interaction.reply({
    content: `イベントログの送信先を <#${channel.id}> に設定しました。`,
    ephemeral: true
  });
}

function canBotSendEventLog(
  channel: unknown,
  interaction: ChatInputCommandInteraction<"cached">
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

  const permissions = (
    channel as {
      permissionsFor(user: unknown): { has(permissions: bigint[]): boolean } | null;
    }
  ).permissionsFor(clientUser);

  return (
    permissions?.has([
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.EmbedLinks
    ]) ?? false
  );
}

async function handleDisable(
  interaction: ChatInputCommandInteraction<"cached">,
  service: EventLogService
): Promise<void> {
  await service.disable(interaction.guildId);
  await interaction.reply({
    content: "イベントログを無効にしました。",
    ephemeral: true
  });
}

async function handleCategory(
  interaction: ChatInputCommandInteraction<"cached">,
  service: EventLogService
): Promise<void> {
  const category = interaction.options.getString("category", true);
  const enabled = interaction.options.getBoolean("enabled", true);

  if (!isEventLogCategory(category)) {
    await interaction.reply({
      content: "未知のイベントログカテゴリです。",
      ephemeral: true
    });
    return;
  }

  const config = await service.setCategory(interaction.guildId, category, enabled);

  if (!config) {
    await interaction.reply({
      content: "先に `/eventlog set` で送信先チャンネルを設定してください。",
      ephemeral: true
    });
    return;
  }

  await interaction.reply({
    content: `${eventLogCategoryLabels[category]}ログを${enabled ? "有効" : "無効"}にしました。`,
    ephemeral: true
  });
}

async function handleStatus(
  interaction: ChatInputCommandInteraction<"cached">,
  service: EventLogService
): Promise<void> {
  const config = await service.getConfig(interaction.guildId);

  if (!config?.enabled) {
    await interaction.reply({
      content: "イベントログは無効です。",
      ephemeral: true
    });
    return;
  }

  await interaction.reply({
    content: [
      `イベントログは有効です。送信先: <#${config.channelId}>`,
      `有効カテゴリ: ${formatCategoryList(config.enabledCategories)}`
    ].join("\n"),
    ephemeral: true
  });
}

async function handleTest(
  interaction: ChatInputCommandInteraction<"cached">,
  service: EventLogService
): Promise<void> {
  const sent = await service.send(
    interaction.guild,
    "server",
    createLogEmbed("イベントログ テスト", "server_update").setDescription(
      "イベントログのテスト送信です。"
    )
  );
  await interaction.reply({
    content: sent
      ? "テストログを送信しました。"
      : "テストログを送信できませんでした。設定と Bot の送信権限を確認してください。",
    ephemeral: true
  });
}

function formatCategoryList(categories: readonly string[]): string {
  return eventLogCategories
    .map((category) =>
      categories.includes(category)
        ? `${eventLogCategoryLabels[category]}: ON`
        : `${eventLogCategoryLabels[category]}: OFF`
    )
    .join(" / ");
}
