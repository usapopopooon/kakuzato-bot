import type { AppConfig } from "../../platform/config/env";
import type { BotModule } from "../../platform/discord/botModule";
import type { AppLogger } from "../../platform/logger/logger";
import { createEventLogCommand } from "./commands/eventLogCommand";
import { createEventLogEvents } from "./events/eventLogEvents";
import { EventLogConfigRepository } from "./repositories/eventLogConfigRepository";
import { EventLogService } from "./services/eventLogService";

type EventLogModuleDeps = {
  config: Pick<AppConfig, "eventLogConfigPath">;
  logger: AppLogger;
};

export function createEventLogModule({ config, logger }: EventLogModuleDeps): BotModule {
  const repository = new EventLogConfigRepository(config.eventLogConfigPath);
  const service = new EventLogService(repository, logger);

  return {
    name: "event-log",
    commands: [createEventLogCommand(service)],
    events: createEventLogEvents(service)
  };
}
