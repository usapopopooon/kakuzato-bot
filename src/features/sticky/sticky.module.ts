import type { BotModule } from "../../platform/discord/botModule";
import type { AppLogger } from "../../platform/logger/logger";
import { createStickyMessageCommand } from "./commands/stickyMessageCommand";
import { createStickyMessageEvents } from "./events/stickyMessageEvents";
import { StickyMessageRepository } from "./repositories/stickyMessageRepository";
import { StickyMessageService } from "./services/stickyMessageService";

const stickyMessageConfigPath = "data/sticky-message-configs.json";

type StickyModuleDeps = {
  logger: AppLogger;
};

export function createStickyModule({ logger }: StickyModuleDeps): BotModule {
  const repository = new StickyMessageRepository(stickyMessageConfigPath);
  const service = new StickyMessageService(repository, logger);

  return {
    name: "sticky",
    commands: [createStickyMessageCommand(service)],
    events: createStickyMessageEvents(service)
  };
}
