import { Events, type ChatInputCommandInteraction, type Client, type Guild } from "discord.js";
import type { AppLogger } from "../logger/logger";
import type { BotModule, DiscordCommand } from "./botModule";

export function collectCommands(modules: BotModule[]): DiscordCommand[] {
  return modules.flatMap((botModule) => botModule.commands ?? []);
}

export function registerInteractionRouter(
  client: Client,
  commands: DiscordCommand[],
  logger: AppLogger
): void {
  const commandMap = new Map(commands.map((command) => [command.data.name, command]));

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) {
      return;
    }

    const command = commandMap.get(interaction.commandName);

    if (!command) {
      logger.warn({ commandName: interaction.commandName }, "Unknown command interaction");
      return;
    }

    await executeCommand(command, interaction, logger);
  });
}

export async function syncGuildCommands(
  client: Client<true>,
  commands: DiscordCommand[],
  logger: AppLogger
): Promise<void> {
  await Promise.all(
    client.guilds.cache.map((guild) => syncCommandsForGuild(guild, commands, logger))
  );
}

export async function syncCommandsForGuild(
  guild: Guild,
  commands: DiscordCommand[],
  logger: AppLogger
): Promise<void> {
  try {
    await guild.commands.set(commands.map((command) => command.data.toJSON()));
    logger.info({ guildId: guild.id, count: commands.length }, "Synced guild commands");
  } catch (error) {
    logger.error({ error, guildId: guild.id }, "Failed to sync guild commands");
  }
}

async function executeCommand(
  command: DiscordCommand,
  interaction: ChatInputCommandInteraction,
  logger: AppLogger
): Promise<void> {
  try {
    await command.execute(interaction);
  } catch (error) {
    logger.error(
      { error, commandName: interaction.commandName, guildId: interaction.guildId },
      "Command execution failed"
    );

    const message = "コマンドの実行中にエラーが発生しました。";

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: message, ephemeral: true });
      return;
    }

    await interaction.reply({ content: message, ephemeral: true });
  }
}
