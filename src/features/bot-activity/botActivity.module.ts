import type { BotModule } from "../../platform/discord/botModule";
import type { AppLogger } from "../../platform/logger/logger";
import { createBotActivityCommand } from "./commands/botActivityCommand";
import { createClientReadyEvent } from "./events/clientReady";
import { BotActivityRepository } from "./repositories/botActivityRepository";
import { BotActivityService } from "./services/botActivityService";

const botActivityConfigPath = "data/bot-activity-config.json";

type BotActivityModuleDeps = {
  logger: AppLogger;
};

export function createBotActivityModule({ logger }: BotActivityModuleDeps): BotModule {
  const repository = new BotActivityRepository(botActivityConfigPath);
  const service = new BotActivityService(repository, logger);

  return {
    name: "bot-activity",
    commands: [createBotActivityCommand(service)],
    events: [createClientReadyEvent(service)]
  };
}
