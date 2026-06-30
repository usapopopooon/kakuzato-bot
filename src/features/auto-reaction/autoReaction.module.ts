import type { AppPrismaClient } from '../../platform/database/prisma'
import type { BotModule } from '../../platform/discord/botModule'
import type { AppLogger } from '../../platform/logger/logger'
import { createAutoReactionCommand } from './commands/autoReactionCommand'
import { createAutoReactionEvents } from './events/autoReactionEvents'
import { AutoReactionRepository } from './repositories/autoReactionRepository'
import { AutoReactionService } from './services/autoReactionService'

type AutoReactionModuleDeps = {
  logger: AppLogger
  prisma: AppPrismaClient
}

export function createAutoReactionModule({ logger, prisma }: AutoReactionModuleDeps): BotModule {
  const repository = new AutoReactionRepository(prisma)
  const service = new AutoReactionService(repository, logger)

  return {
    name: 'auto-reaction',
    commands: [createAutoReactionCommand(service)],
    events: createAutoReactionEvents(service)
  }
}
