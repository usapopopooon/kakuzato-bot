import type { AppPrismaClient } from '../../../platform/database/prisma'

export type VoiceNotifyConfig = {
  id: number
  guildId: string
  voiceChannelId: string
  notifyChannelId: string
  createdAt: string
  updatedAt: string
}

export type VoiceNotifyCategoryConfig = {
  id: number
  guildId: string
  categoryId: string
  notifyChannelId: string
  createdAt: string
  updatedAt: string
}

export type VoiceNotifyExclude = {
  id: number
  guildId: string
  voiceChannelId: string
  createdAt: string
  updatedAt: string
}

type VoiceNotifyPrisma = Pick<
  AppPrismaClient,
  'voiceNotifyConfig' | 'voiceNotifyCategoryConfig' | 'voiceNotifyExclude'
>

export class VoiceNotifyRepository {
  private readonly prisma: VoiceNotifyPrisma

  constructor(prisma: VoiceNotifyPrisma) {
    this.prisma = prisma
  }

  async get(guildId: string, voiceChannelId: string): Promise<VoiceNotifyConfig | undefined> {
    const config = await this.prisma.voiceNotifyConfig.findUnique({
      where: {
        guildId_voiceChannelId: {
          guildId,
          voiceChannelId
        }
      }
    })

    return config ? toVoiceNotifyConfig(config) : undefined
  }

  async listByGuild(guildId: string): Promise<VoiceNotifyConfig[]> {
    const configs = await this.prisma.voiceNotifyConfig.findMany({
      where: { guildId },
      orderBy: { createdAt: 'asc' }
    })

    return configs.map(toVoiceNotifyConfig)
  }

  async listByVoiceChannel(guildId: string, voiceChannelId: string): Promise<VoiceNotifyConfig[]> {
    const configs = await this.prisma.voiceNotifyConfig.findMany({
      where: {
        guildId,
        voiceChannelId
      }
    })

    return configs.map(toVoiceNotifyConfig)
  }

  async set(
    guildId: string,
    voiceChannelId: string,
    notifyChannelId: string
  ): Promise<VoiceNotifyConfig> {
    const config = await this.prisma.voiceNotifyConfig.upsert({
      where: {
        guildId_voiceChannelId: {
          guildId,
          voiceChannelId
        }
      },
      create: {
        guildId,
        voiceChannelId,
        notifyChannelId
      },
      update: {
        notifyChannelId
      }
    })

    return toVoiceNotifyConfig(config)
  }

  async getCategory(
    guildId: string,
    categoryId: string
  ): Promise<VoiceNotifyCategoryConfig | undefined> {
    const config = await this.prisma.voiceNotifyCategoryConfig.findUnique({
      where: {
        guildId_categoryId: {
          guildId,
          categoryId
        }
      }
    })

    return config ? toVoiceNotifyCategoryConfig(config) : undefined
  }

  async listCategoriesByGuild(guildId: string): Promise<VoiceNotifyCategoryConfig[]> {
    const configs = await this.prisma.voiceNotifyCategoryConfig.findMany({
      where: { guildId },
      orderBy: { createdAt: 'asc' }
    })

    return configs.map(toVoiceNotifyCategoryConfig)
  }

  async setCategory(
    guildId: string,
    categoryId: string,
    notifyChannelId: string
  ): Promise<VoiceNotifyCategoryConfig> {
    const config = await this.prisma.voiceNotifyCategoryConfig.upsert({
      where: {
        guildId_categoryId: {
          guildId,
          categoryId
        }
      },
      create: {
        guildId,
        categoryId,
        notifyChannelId
      },
      update: {
        notifyChannelId
      }
    })

    return toVoiceNotifyCategoryConfig(config)
  }

  async delete(guildId: string, voiceChannelId: string): Promise<boolean> {
    const result = await this.prisma.voiceNotifyConfig.deleteMany({
      where: {
        guildId,
        voiceChannelId
      }
    })

    return result.count > 0
  }

  async deleteCategory(guildId: string, categoryId: string): Promise<boolean> {
    const result = await this.prisma.voiceNotifyCategoryConfig.deleteMany({
      where: {
        guildId,
        categoryId
      }
    })

    return result.count > 0
  }

  async listExcludesByGuild(guildId: string): Promise<VoiceNotifyExclude[]> {
    const excludes = await this.prisma.voiceNotifyExclude.findMany({
      where: { guildId },
      orderBy: { createdAt: 'asc' }
    })

    return excludes.map(toVoiceNotifyExclude)
  }

  async isExcluded(guildId: string, voiceChannelId: string): Promise<boolean> {
    const exclude = await this.prisma.voiceNotifyExclude.findUnique({
      where: {
        guildId_voiceChannelId: {
          guildId,
          voiceChannelId
        }
      }
    })

    return Boolean(exclude)
  }

  async setExclude(guildId: string, voiceChannelId: string): Promise<VoiceNotifyExclude> {
    const exclude = await this.prisma.voiceNotifyExclude.upsert({
      where: {
        guildId_voiceChannelId: {
          guildId,
          voiceChannelId
        }
      },
      create: {
        guildId,
        voiceChannelId
      },
      update: {
        voiceChannelId
      }
    })

    return toVoiceNotifyExclude(exclude)
  }

  async deleteExclude(guildId: string, voiceChannelId: string): Promise<boolean> {
    const result = await this.prisma.voiceNotifyExclude.deleteMany({
      where: {
        guildId,
        voiceChannelId
      }
    })

    return result.count > 0
  }

  async deleteByGuild(guildId: string): Promise<number> {
    const [voiceResult, categoryResult, excludeResult] = await Promise.all([
      this.prisma.voiceNotifyConfig.deleteMany({
        where: { guildId }
      }),
      this.prisma.voiceNotifyCategoryConfig.deleteMany({
        where: { guildId }
      }),
      this.prisma.voiceNotifyExclude.deleteMany({
        where: { guildId }
      })
    ])

    return voiceResult.count + categoryResult.count + excludeResult.count
  }

  async deleteByChannel(guildId: string, channelId: string): Promise<number> {
    const [voiceResult, categoryResult, excludeResult] = await Promise.all([
      this.prisma.voiceNotifyConfig.deleteMany({
        where: {
          guildId,
          OR: [{ voiceChannelId: channelId }, { notifyChannelId: channelId }]
        }
      }),
      this.prisma.voiceNotifyCategoryConfig.deleteMany({
        where: {
          guildId,
          OR: [{ categoryId: channelId }, { notifyChannelId: channelId }]
        }
      }),
      this.prisma.voiceNotifyExclude.deleteMany({
        where: {
          guildId,
          voiceChannelId: channelId
        }
      })
    ])

    return voiceResult.count + categoryResult.count + excludeResult.count
  }
}

function toVoiceNotifyConfig(config: {
  id: number
  guildId: string
  voiceChannelId: string
  notifyChannelId: string
  createdAt: Date
  updatedAt: Date
}): VoiceNotifyConfig {
  return {
    id: config.id,
    guildId: config.guildId,
    voiceChannelId: config.voiceChannelId,
    notifyChannelId: config.notifyChannelId,
    createdAt: config.createdAt.toISOString(),
    updatedAt: config.updatedAt.toISOString()
  }
}

function toVoiceNotifyCategoryConfig(config: {
  id: number
  guildId: string
  categoryId: string
  notifyChannelId: string
  createdAt: Date
  updatedAt: Date
}): VoiceNotifyCategoryConfig {
  return {
    id: config.id,
    guildId: config.guildId,
    categoryId: config.categoryId,
    notifyChannelId: config.notifyChannelId,
    createdAt: config.createdAt.toISOString(),
    updatedAt: config.updatedAt.toISOString()
  }
}

function toVoiceNotifyExclude(config: {
  id: number
  guildId: string
  voiceChannelId: string
  createdAt: Date
  updatedAt: Date
}): VoiceNotifyExclude {
  return {
    id: config.id,
    guildId: config.guildId,
    voiceChannelId: config.voiceChannelId,
    createdAt: config.createdAt.toISOString(),
    updatedAt: config.updatedAt.toISOString()
  }
}
