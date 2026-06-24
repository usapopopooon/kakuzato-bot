import type { AppPrismaClient } from '../../../platform/database/prisma'

export const defaultWelcomeMessageContent = 'Welcome, {mention}!'

export type WelcomeConfig = {
  guildId: string
  channelId: string
  enabled: boolean
  messageContent: string
  updatedAt: string
}

export class WelcomeConfigRepository {
  private readonly prisma: Pick<AppPrismaClient, 'welcomeConfig'>

  constructor(prisma: Pick<AppPrismaClient, 'welcomeConfig'>) {
    this.prisma = prisma
  }

  async get(guildId: string): Promise<WelcomeConfig | undefined> {
    const config = await this.prisma.welcomeConfig.findUnique({
      where: { guildId }
    })

    return config ? toWelcomeConfig(config) : undefined
  }

  async setChannel(guildId: string, channelId: string): Promise<WelcomeConfig> {
    const current = await this.prisma.welcomeConfig.findUnique({
      where: { guildId },
      select: { messageContent: true }
    })
    const config = await this.prisma.welcomeConfig.upsert({
      where: { guildId },
      create: {
        guildId,
        channelId,
        enabled: true,
        messageContent: current?.messageContent ?? defaultWelcomeMessageContent
      },
      update: {
        channelId,
        enabled: true
      }
    })

    return toWelcomeConfig(config)
  }

  async setMessage(guildId: string, messageContent: string): Promise<WelcomeConfig | undefined> {
    const config = await this.prisma.welcomeConfig
      .update({
        where: { guildId },
        data: { messageContent }
      })
      .catch((error: unknown) => {
        if (isRecordNotFoundError(error)) {
          return undefined
        }

        throw error
      })

    return config ? toWelcomeConfig(config) : undefined
  }

  async disable(guildId: string): Promise<WelcomeConfig | undefined> {
    const config = await this.prisma.welcomeConfig
      .update({
        where: { guildId },
        data: { enabled: false }
      })
      .catch((error: unknown) => {
        if (isRecordNotFoundError(error)) {
          return undefined
        }

        throw error
      })

    return config ? toWelcomeConfig(config) : undefined
  }
}

function toWelcomeConfig(config: {
  guildId: string
  channelId: string
  enabled: boolean
  messageContent: string
  updatedAt: Date
}): WelcomeConfig {
  return {
    guildId: config.guildId,
    channelId: config.channelId,
    enabled: config.enabled,
    messageContent: config.messageContent,
    updatedAt: config.updatedAt.toISOString()
  }
}

function isRecordNotFoundError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2025'
  )
}
