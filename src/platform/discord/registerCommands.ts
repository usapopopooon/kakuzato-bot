import {
  Events,
  MessageFlags,
  type ChatInputCommandInteraction,
  type Client,
  type Guild,
  type MessageComponentInteraction,
  type ModalSubmitInteraction
} from "discord.js";
import type { AppLogger } from "../logger/logger";
import type {
  BotModule,
  DiscordCommand,
  DiscordComponentHandler,
  DiscordModalSubmitHandler
} from "./botModule";

export function collectCommands(modules: BotModule[]): DiscordCommand[] {
  return modules.flatMap((botModule) => botModule.commands ?? []);
}

export function collectComponentHandlers(modules: BotModule[]): DiscordComponentHandler[] {
  return modules.flatMap((botModule) => botModule.componentHandlers ?? []);
}

export function collectModalSubmitHandlers(modules: BotModule[]): DiscordModalSubmitHandler[] {
  return modules.flatMap((botModule) => botModule.modalSubmitHandlers ?? []);
}

export function registerInteractionRouter(
  client: Client,
  commands: DiscordCommand[],
  logger: AppLogger,
  handlers: {
    componentHandlers?: DiscordComponentHandler[];
    modalSubmitHandlers?: DiscordModalSubmitHandler[];
  } = {}
): void {
  const commandMap = new Map(commands.map((command) => [command.data.name, command]));
  const componentHandlers = handlers.componentHandlers ?? [];
  const modalSubmitHandlers = handlers.modalSubmitHandlers ?? [];

  client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isChatInputCommand()) {
      const command = commandMap.get(interaction.commandName);

      if (!command) {
        logger.warn({ commandName: interaction.commandName }, "Unknown command interaction");
        return;
      }

      await executeCommand(command, interaction, logger);
      return;
    }

    if (interaction.isMessageComponent()) {
      const handler = componentHandlers.find((candidate) =>
        interaction.customId.startsWith(candidate.customIdPrefix)
      );

      if (!handler) {
        logger.warn({ customId: interaction.customId }, "Unknown component interaction");
        return;
      }

      await executeComponentHandler(handler, interaction, logger);
      return;
    }

    if (interaction.isModalSubmit()) {
      const handler = modalSubmitHandlers.find((candidate) =>
        interaction.customId.startsWith(candidate.customIdPrefix)
      );

      if (!handler) {
        logger.warn({ customId: interaction.customId }, "Unknown modal submit interaction");
        return;
      }

      await executeModalSubmitHandler(handler, interaction, logger);
    }
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
      await interaction.followUp({ content: message, flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
  }
}

async function executeComponentHandler(
  handler: DiscordComponentHandler,
  interaction: MessageComponentInteraction,
  logger: AppLogger
): Promise<void> {
  try {
    await handler.execute(interaction);
  } catch (error) {
    logger.error(
      { error, customId: interaction.customId, guildId: interaction.guildId },
      "Component interaction execution failed"
    );

    const message = "操作の処理中にエラーが発生しました。";

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: message, flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
  }
}

async function executeModalSubmitHandler(
  handler: DiscordModalSubmitHandler,
  interaction: ModalSubmitInteraction,
  logger: AppLogger
): Promise<void> {
  try {
    await handler.execute(interaction);
  } catch (error) {
    logger.error(
      { error, customId: interaction.customId, guildId: interaction.guildId },
      "Modal submit execution failed"
    );

    const message = "入力内容の処理中にエラーが発生しました。";

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: message, flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
  }
}
