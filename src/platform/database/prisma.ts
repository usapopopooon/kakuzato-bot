import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'
import type { AppLogger } from '../logger/logger'

export type AppPrismaClient = PrismaClient

export function createPrismaClient(databaseUrl: string): AppPrismaClient {
  const adapter = new PrismaPg({ connectionString: databaseUrl })
  return new PrismaClient({ adapter })
}

export async function connectDatabase(client: AppPrismaClient, logger: AppLogger): Promise<void> {
  await client.$connect()
  logger.info('Connected to PostgreSQL')
}

export async function disconnectDatabase(
  client: Pick<AppPrismaClient, '$disconnect'>,
  logger: AppLogger
): Promise<void> {
  await client.$disconnect()
  logger.info('Disconnected from PostgreSQL')
}
