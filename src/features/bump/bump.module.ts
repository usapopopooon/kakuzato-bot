import type { AppPrismaClient } from "../../platform/database/prisma";
import type { BotModule } from "../../platform/discord/botModule";
import type { AppLogger } from "../../platform/logger/logger";
import { createBumpCommand, createBumpComponentHandler } from "./commands/bumpCommand";
import { createBumpEvents } from "./events/bumpEvents";
import { BumpRepository } from "./repositories/bumpRepository";
import { BumpService } from "./services/bumpService";

type BumpModuleDeps = {
  logger: AppLogger;
  prisma: AppPrismaClient;
};

export function createBumpModule({ logger, prisma }: BumpModuleDeps): BotModule {
  const repository = new BumpRepository(prisma);
  const service = new BumpService(repository, logger);

  return {
    name: "bump",
    commands: [createBumpCommand(service)],
    componentHandlers: [createBumpComponentHandler(service)],
    events: createBumpEvents(service)
  };
}
