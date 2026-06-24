import type { AppPrismaClient } from '../../platform/database/prisma'
import type { BotModule } from '../../platform/discord/botModule'
import type { AppLogger } from '../../platform/logger/logger'
import { createVoiceNotifyCommand } from './commands/voiceNotifyCommand'
import { createVoiceNotifyEvents } from './events/voiceNotifyEvents'
import { VoiceNotifyRepository } from './repositories/voiceNotifyRepository'
import { VoiceNotifyService } from './services/voiceNotifyService'

type VoiceNotifyModuleDeps = {
  logger: AppLogger
  prisma: AppPrismaClient
}

export function createVoiceNotifyModule({ logger, prisma }: VoiceNotifyModuleDeps): BotModule {
  const repository = new VoiceNotifyRepository(prisma)
  const service = new VoiceNotifyService(repository, logger)

  return {
    name: 'voice-notify',
    commands: [createVoiceNotifyCommand(service)],
    events: createVoiceNotifyEvents(service)
  }
}
