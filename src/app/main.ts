import { Events } from "discord.js";
import { loadConfig } from "../platform/config/env";
import { createDiscordClient } from "../platform/discord/client";
import {
  collectCommands,
  collectModalSubmitHandlers,
  registerInteractionRouter,
  syncCommandsForGuild,
  syncGuildCommands
} from "../platform/discord/registerCommands";
import { registerBotModules } from "../platform/discord/registerBotModules";
import { createLogger } from "../platform/logger/logger";
import { createBotActivityModule } from "../features/bot-activity/botActivity.module";
import { createEventLogModule } from "../features/event-log/eventLog.module";
import { createStickyModule } from "../features/sticky/sticky.module";
import { createWelcomeModule } from "../features/welcome/welcome.module";
import { markHealthy } from "./health";
import { setupShutdown } from "./shutdown";

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);
  const client = createDiscordClient();

  const modules = [
    createBotActivityModule({ logger }),
    createWelcomeModule({ logger }),
    createStickyModule({ logger }),
    createEventLogModule({ config, logger })
  ];
  const commands = collectCommands(modules);
  const modalSubmitHandlers = collectModalSubmitHandlers(modules);

  registerBotModules(client, modules, logger);
  registerInteractionRouter(client, commands, logger, modalSubmitHandlers);

  client.once(Events.ClientReady, async (readyClient) => {
    await syncGuildCommands(readyClient, commands, logger);
    logger.info({ user: readyClient.user.tag }, "Discord bot is ready");
    await markHealthy(config.healthcheckFile);
  });

  client.on(Events.GuildCreate, async (guild) => {
    await syncCommandsForGuild(guild, commands, logger);
  });

  setupShutdown({ client, healthcheckFile: config.healthcheckFile, logger });

  await client.login(config.discordToken);
}

main().catch((error) => {
  const logger = createLogger("fatal");
  logger.fatal({ error }, "Failed to start Discord bot");
  process.exit(1);
});
