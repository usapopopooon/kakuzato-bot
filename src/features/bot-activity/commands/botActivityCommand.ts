import {
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction
} from "discord.js";
import type { DiscordCommand } from "../../../platform/discord/botModule";
import { defaultBotActivityName } from "../repositories/botActivityRepository";
import type { BotActivityService } from "../services/botActivityService";

const maxActivityNameLength = 128;

export function createBotActivityCommand(service: BotActivityService): DiscordCommand {
  return {
    data: new SlashCommandBuilder()
      .setName("activity")
      .setDescription("Botのプレイ中表示を設定します")
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .setDMPermission(false)
      .addSubcommand((subcommand) =>
        subcommand
          .setName("set")
          .setDescription("Botのプレイ中表示を設定します")
          .addStringOption((option) =>
            option
              .setName("name")
              .setDescription("プレイ中に表示する文言")
              .setMaxLength(maxActivityNameLength)
              .setRequired(true)
          )
      )
      .addSubcommand((subcommand) =>
        subcommand.setName("reset").setDescription("Botのプレイ中表示をデフォルトに戻します")
      )
      .addSubcommand((subcommand) =>
        subcommand.setName("status").setDescription("Botのプレイ中表示設定を表示します")
      ),
    execute: (interaction) => executeBotActivityCommand(interaction, service)
  };
}

async function executeBotActivityCommand(
  interaction: ChatInputCommandInteraction,
  service: BotActivityService
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

  if (subcommand === "reset") {
    await handleReset(interaction, service);
    return;
  }

  if (subcommand === "status") {
    await handleStatus(interaction, service);
  }
}

async function handleSet(
  interaction: ChatInputCommandInteraction<"cached">,
  service: BotActivityService
): Promise<void> {
  const activityName = interaction.options.getString("name", true).trim();

  if (activityName.length === 0) {
    await interaction.reply({
      content: "プレイ中表示は空にできません。",
      ephemeral: true
    });
    return;
  }

  const config = await service.setName(activityName);
  await service.applyToClient(interaction.client, config.activityName);
  await interaction.reply({
    content: `Botのプレイ中表示を「${config.activityName}」に設定しました。`,
    ephemeral: true
  });
}

async function handleReset(
  interaction: ChatInputCommandInteraction<"cached">,
  service: BotActivityService
): Promise<void> {
  const config = await service.reset();
  await service.applyToClient(interaction.client, config.activityName);
  await interaction.reply({
    content: `Botのプレイ中表示をデフォルトの「${defaultBotActivityName}」に戻しました。`,
    ephemeral: true
  });
}

async function handleStatus(
  interaction: ChatInputCommandInteraction<"cached">,
  service: BotActivityService
): Promise<void> {
  const config = await service.getConfig();

  await interaction.reply({
    content: `Botのプレイ中表示: ${config.activityName}`,
    ephemeral: true
  });
}
