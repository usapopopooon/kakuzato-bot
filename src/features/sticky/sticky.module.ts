import type { BotModule } from '../../platform/discord/botModule'
import type { AppLogger } from '../../platform/logger/logger'
import type { AppPrismaClient } from '../../platform/database/prisma'
import {
  createStickyMessageCommand,
  createStickyMessageModalSubmitHandler
} from './commands/stickyMessageCommand'
import { createStickyMessageEvents } from './events/stickyMessageEvents'
import { StickyMessageRepository } from './repositories/stickyMessageRepository'
import { StickyMessageService } from './services/stickyMessageService'

type StickyModuleDeps = {
  logger: AppLogger
  prisma: AppPrismaClient
}

export function createStickyModule({ logger, prisma }: StickyModuleDeps): BotModule {
  const repository = new StickyMessageRepository(prisma)
  const service = new StickyMessageService(repository, logger)

  return {
    name: 'sticky',
    commands: [createStickyMessageCommand(service)],
    events: createStickyMessageEvents(service),
    modalSubmitHandlers: [createStickyMessageModalSubmitHandler(service)]
  }
}
