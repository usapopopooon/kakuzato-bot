import { ActivityType } from 'discord.js'
import type { AppLogger } from '../../../platform/logger/logger'
import type {
  BotActivityConfig,
  BotActivityRepository
} from '../repositories/botActivityRepository'

export type BotActivityClient = {
  user: {
    setActivity(name: string, options: { type: ActivityType.Playing }): unknown
  }
}

export class BotActivityService {
  private readonly repository: BotActivityRepository
  private readonly logger: AppLogger

  constructor(repository: BotActivityRepository, logger: AppLogger) {
    this.repository = repository
    this.logger = logger
  }

  async getConfig(): Promise<BotActivityConfig> {
    return this.repository.get()
  }

  async setName(activityName: string): Promise<BotActivityConfig> {
    return this.repository.setName(activityName)
  }

  async reset(): Promise<BotActivityConfig> {
    return this.repository.reset()
  }

  async applyToClient(
    client: BotActivityClient,
    activityName?: string
  ): Promise<BotActivityConfig> {
    const config = activityName
      ? { activityName, updatedAt: new Date().toISOString() }
      : await this.repository.get()

    client.user.setActivity(config.activityName, {
      type: ActivityType.Playing
    })
    this.logger.info({ activityName: config.activityName }, 'Applied bot activity')

    return config
  }
}
