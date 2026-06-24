import type { AppPrismaClient } from '../../../platform/database/prisma'

export type VoiceNotifyConfig = {
  id: number
  guildId: string
  voiceChannelId: string
  notifyChannelId: string
  createdAt: string
  updatedAt: string
}

export class VoiceNotifyRepository {
  private readonly prisma: Pick<AppPrismaClient, 'voiceNotifyConfig'>

  constructor(prisma: Pick<AppPrismaClient, 'voiceNotifyConfig'>) {
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

  async delete(guildId: string, voiceChannelId: string): Promise<boolean> {
    const result = await this.prisma.voiceNotifyConfig.deleteMany({
      where: {
        guildId,
        voiceChannelId
      }
    })

    return result.count > 0
  }

  async deleteByGuild(guildId: string): Promise<number> {
    const result = await this.prisma.voiceNotifyConfig.deleteMany({
      where: { guildId }
    })

    return result.count
  }

  async deleteByChannel(guildId: string, channelId: string): Promise<number> {
    const result = await this.prisma.voiceNotifyConfig.deleteMany({
      where: {
        guildId,
        OR: [{ voiceChannelId: channelId }, { notifyChannelId: channelId }]
      }
    })

    return result.count
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
