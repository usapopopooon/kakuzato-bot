import type { AppPrismaClient } from '../../../platform/database/prisma'

export const defaultBotActivityName = 'サーバーを管理中。'
const botActivityConfigId = 'global'

export type BotActivityConfig = {
  activityName: string
  updatedAt: string
}

export class BotActivityRepository {
  private readonly prisma: Pick<AppPrismaClient, 'botActivityConfig'>

  constructor(prisma: Pick<AppPrismaClient, 'botActivityConfig'>) {
    this.prisma = prisma
  }

  async get(): Promise<BotActivityConfig> {
    const config = await this.prisma.botActivityConfig.findUnique({
      where: { id: botActivityConfigId }
    })

    if (!config) {
      return {
        activityName: defaultBotActivityName,
        updatedAt: new Date(0).toISOString()
      }
    }

    return toBotActivityConfig(config)
  }

  async setName(activityName: string): Promise<BotActivityConfig> {
    const config = await this.prisma.botActivityConfig.upsert({
      where: { id: botActivityConfigId },
      create: {
        id: botActivityConfigId,
        activityName
      },
      update: {
        activityName
      }
    })

    return toBotActivityConfig(config)
  }

  async reset(): Promise<BotActivityConfig> {
    return this.setName(defaultBotActivityName)
  }
}

function toBotActivityConfig(config: { activityName: string; updatedAt: Date }): BotActivityConfig {
  return {
    activityName: config.activityName,
    updatedAt: config.updatedAt.toISOString()
  }
}
