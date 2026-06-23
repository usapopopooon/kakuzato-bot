import { ActivityType, Events } from "discord.js";
import { loadConfig } from "../platform/config/env";
import { createDiscordClient } from "../platform/discord/client";
import { registerBotModules } from "../platform/discord/registerBotModules";
import { createLogger } from "../platform/logger/logger";
import { createWelcomeModule } from "../features/welcome/welcome.module";
import { markHealthy } from "./health";
import { setupShutdown } from "./shutdown";

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);
  const client = createDiscordClient();

  const modules = [createWelcomeModule({ config, logger })];

  registerBotModules(client, modules, logger);

  client.once(Events.ClientReady, async (readyClient) => {
    readyClient.user.setActivity(config.botActivityName, {
      type: ActivityType.Playing
    });
    logger.info({ user: readyClient.user.tag }, "Discord bot is ready");
    await markHealthy(config.healthcheckFile);
  });

  setupShutdown({ client, healthcheckFile: config.healthcheckFile, logger });

  await client.login(config.discordToken);
}

main().catch((error) => {
  const logger = createLogger("fatal");
  logger.fatal({ error }, "Failed to start Discord bot");
  process.exit(1);
});
