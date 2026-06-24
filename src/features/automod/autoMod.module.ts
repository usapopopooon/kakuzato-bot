import type { BotModule } from '../../platform/discord/botModule'
import type { AppPrismaClient } from '../../platform/database/prisma'
import type { AppLogger } from '../../platform/logger/logger'
import { createAutoModCommand } from './commands/autoModCommand'
import { createAutoModGuildMemberAddEvent } from './events/guildMemberAdd'
import { AutoModRepository } from './repositories/autoModRepository'
import type { AutoModJoinBlocklist } from './services/autoModJoinBlocklist'
import { AutoModService } from './services/autoModService'

type AutoModModuleDeps = {
  logger: AppLogger
  prisma: AppPrismaClient
  joinBlocklist?: AutoModJoinBlocklist
}

export function createAutoModModule({
  logger,
  prisma,
  joinBlocklist
}: AutoModModuleDeps): BotModule {
  const repository = new AutoModRepository(prisma)
  const service = new AutoModService(repository, logger, joinBlocklist)

  return {
    name: 'automod',
    commands: [createAutoModCommand(service)],
    events: [createAutoModGuildMemberAddEvent({ autoModService: service })]
  }
}
