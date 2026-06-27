import type { BotModule } from '../../platform/discord/botModule'
import type { AppPrismaClient } from '../../platform/database/prisma'
import type { AppLogger } from '../../platform/logger/logger'
import {
  createNoteCommand,
  createNoteComponentHandler,
  createNoteModalSubmitHandler
} from './commands/noteCommand'
import { createNoteEvents } from './events/noteEvents'
import { NoteRepository } from './repositories/noteRepository'
import { NoteService } from './services/noteService'

type NoteModuleDeps = {
  logger: AppLogger
  prisma: AppPrismaClient
}

export function createNoteModule({ logger, prisma }: NoteModuleDeps): BotModule {
  const repository = new NoteRepository(prisma)
  const service = new NoteService(repository, logger)

  return {
    name: 'note',
    commands: [createNoteCommand(service)],
    componentHandlers: [createNoteComponentHandler(service)],
    modalSubmitHandlers: [createNoteModalSubmitHandler(service)],
    events: createNoteEvents(service)
  }
}
