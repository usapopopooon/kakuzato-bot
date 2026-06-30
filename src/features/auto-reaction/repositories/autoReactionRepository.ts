import type { AppPrismaClient } from '../../../platform/database/prisma'

export type AutoReactionConfig = {
  guildId: string
  channelId: string
  emojis: string[]
  createdAt: string
  updatedAt: string
}

type AutoReactionPrisma = Pick<AppPrismaClient, 'autoReactionConfig'>

export class AutoReactionRepository {
  private readonly prisma: AutoReactionPrisma

  constructor(prisma: AutoReactionPrisma) {
    this.prisma = prisma
  }

  async get(channelId: string): Promise<AutoReactionConfig | undefined> {
    const config = await this.prisma.autoReactionConfig.findUnique({
      where: { channelId }
    })

    return config ? toAutoReactionConfig(config) : undefined
  }

  async list(): Promise<AutoReactionConfig[]> {
    const configs = await this.prisma.autoReactionConfig.findMany({
      orderBy: [{ guildId: 'asc' }, { createdAt: 'asc' }]
    })

    return configs.map(toAutoReactionConfig)
  }

  async listByGuild(guildId: string): Promise<AutoReactionConfig[]> {
    const configs = await this.prisma.autoReactionConfig.findMany({
      where: { guildId },
      orderBy: { createdAt: 'asc' }
    })

    return configs.map(toAutoReactionConfig)
  }

  async set(input: {
    guildId: string
    channelId: string
    emojis: string[]
  }): Promise<AutoReactionConfig> {
    const config = await this.prisma.autoReactionConfig.upsert({
      where: { channelId: input.channelId },
      create: {
        guildId: input.guildId,
        channelId: input.channelId,
        emojis: input.emojis
      },
      update: {
        guildId: input.guildId,
        emojis: input.emojis
      }
    })

    return toAutoReactionConfig(config)
  }

  async delete(channelId: string): Promise<boolean> {
    const result = await this.prisma.autoReactionConfig.deleteMany({
      where: { channelId }
    })

    return result.count > 0
  }

  async deleteByGuild(guildId: string): Promise<number> {
    const result = await this.prisma.autoReactionConfig.deleteMany({
      where: { guildId }
    })

    return result.count
  }
}

function toAutoReactionConfig(config: {
  guildId: string
  channelId: string
  emojis: string[]
  createdAt: Date
  updatedAt: Date
}): AutoReactionConfig {
  return {
    guildId: config.guildId,
    channelId: config.channelId,
    emojis: [...config.emojis],
    createdAt: config.createdAt.toISOString(),
    updatedAt: config.updatedAt.toISOString()
  }
}
