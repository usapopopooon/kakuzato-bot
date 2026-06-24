import type { BotModule } from '../../platform/discord/botModule'
import type { AppLogger } from '../../platform/logger/logger'
import type { AppPrismaClient } from '../../platform/database/prisma'
import { createBotActivityCommand } from './commands/botActivityCommand'
import { createClientReadyEvent } from './events/clientReady'
import { BotActivityRepository } from './repositories/botActivityRepository'
import { BotActivityService } from './services/botActivityService'

type BotActivityModuleDeps = {
  logger: AppLogger
  prisma: AppPrismaClient
}

export function createBotActivityModule({ logger, prisma }: BotActivityModuleDeps): BotModule {
  const repository = new BotActivityRepository(prisma)
  const service = new BotActivityService(repository, logger)

  return {
    name: 'bot-activity',
    commands: [createBotActivityCommand(service)],
    events: [createClientReadyEvent(service)]
  }
}
