import type { AppPrismaClient } from "../../platform/database/prisma";
import type { BotModule } from "../../platform/discord/botModule";
import type { AppLogger } from "../../platform/logger/logger";
import { createEventLogCommand } from "./commands/eventLogCommand";
import { createEventLogEvents } from "./events/eventLogEvents";
import { EventLogConfigRepository } from "./repositories/eventLogConfigRepository";
import { EventLogService } from "./services/eventLogService";

type EventLogModuleDeps = {
  logger: AppLogger;
  prisma: AppPrismaClient;
};

export function createEventLogModule({ logger, prisma }: EventLogModuleDeps): BotModule {
  const repository = new EventLogConfigRepository(prisma);
  const service = new EventLogService(repository, logger);

  return {
    name: "event-log",
    commands: [createEventLogCommand(service)],
    events: createEventLogEvents(service)
  };
}
