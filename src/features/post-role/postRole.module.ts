import type { AppPrismaClient } from '../../platform/database/prisma'
import type { BotModule } from '../../platform/discord/botModule'
import type { AppLogger } from '../../platform/logger/logger'
import { createPostRoleCommand } from './commands/postRoleCommand'
import { createPostRoleEvents } from './events/postRoleEvents'
import { PostRoleRepository } from './repositories/postRoleRepository'
import { PostRoleService } from './services/postRoleService'

type PostRoleModuleDeps = {
  logger: AppLogger
  prisma: AppPrismaClient
}

export function createPostRoleModule({ logger, prisma }: PostRoleModuleDeps): BotModule {
  const repository = new PostRoleRepository(prisma)
  const service = new PostRoleService(repository, logger)

  return {
    name: 'post-role',
    commands: [createPostRoleCommand(service)],
    events: createPostRoleEvents(service)
  }
}
