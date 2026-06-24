import type { Client } from 'discord.js'
import type { AppPrismaClient } from '../platform/database/prisma'
import { disconnectDatabase } from '../platform/database/prisma'
import type { AppLogger } from '../platform/logger/logger'
import { clearHealthy } from './health'

type ShutdownOptions = {
  client: Client
  prisma: Pick<AppPrismaClient, '$disconnect'>
  healthcheckFile: string
  logger: AppLogger
}

export function setupShutdown({ client, prisma, healthcheckFile, logger }: ShutdownOptions): void {
  let shuttingDown = false

  const shutdown = async (signal: NodeJS.Signals) => {
    if (shuttingDown) {
      return
    }

    shuttingDown = true
    logger.info({ signal }, 'Shutting down')

    await clearHealthy(healthcheckFile)
    await client.destroy()
    await disconnectDatabase(prisma, logger)
    process.exit(0)
  }

  process.once('SIGTERM', (signal) => {
    void shutdown(signal)
  })
  process.once('SIGINT', (signal) => {
    void shutdown(signal)
  })
}
