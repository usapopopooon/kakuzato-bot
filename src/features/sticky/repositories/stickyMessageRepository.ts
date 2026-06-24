import type { AppPrismaClient } from '../../../platform/database/prisma'

export type StickyMessageType = 'text' | 'embed'

export type StickyMessageConfig = {
  guildId: string
  channelId: string
  messageId?: string
  messageType: StickyMessageType
  title: string
  description: string
  color?: number
  delaySeconds: number
  lastPostedAt?: string
  updatedAt: string
}

export const defaultStickyDelaySeconds = 5
export const defaultStickyEmbedColor = 0x85e7ad
export const maxStickyDelaySeconds = 3_600
export const minStickyDelaySeconds = 1

export class StickyMessageRepository {
  private readonly prisma: Pick<AppPrismaClient, 'stickyMessageConfig'>

  constructor(prisma: Pick<AppPrismaClient, 'stickyMessageConfig'>) {
    this.prisma = prisma
  }

  async get(channelId: string): Promise<StickyMessageConfig | undefined> {
    const config = await this.prisma.stickyMessageConfig.findUnique({
      where: { channelId }
    })

    return config ? toStickyMessageConfig(config) : undefined
  }

  async list(): Promise<StickyMessageConfig[]> {
    const configs = await this.prisma.stickyMessageConfig.findMany()
    return configs.map(toStickyMessageConfig)
  }

  async set(config: Omit<StickyMessageConfig, 'updatedAt'>): Promise<StickyMessageConfig> {
    const normalized = normalizeConfig(config.channelId, config)
    const saved = await this.prisma.stickyMessageConfig.upsert({
      where: { channelId: normalized.channelId },
      create: {
        guildId: normalized.guildId,
        channelId: normalized.channelId,
        messageId: normalized.messageId ?? null,
        messageType: toPrismaMessageType(normalized.messageType),
        title: normalized.title,
        description: normalized.description,
        color: normalized.color ?? null,
        delaySeconds: normalized.delaySeconds,
        lastPostedAt: parseOptionalDate(normalized.lastPostedAt)
      },
      update: {
        guildId: normalized.guildId,
        messageId: normalized.messageId ?? null,
        messageType: toPrismaMessageType(normalized.messageType),
        title: normalized.title,
        description: normalized.description,
        color: normalized.color ?? null,
        delaySeconds: normalized.delaySeconds,
        lastPostedAt: parseOptionalDate(normalized.lastPostedAt)
      }
    })

    return toStickyMessageConfig(saved)
  }

  async updateMessage(
    channelId: string,
    messageId: string,
    lastPostedAt: string
  ): Promise<StickyMessageConfig | undefined> {
    const config = await this.prisma.stickyMessageConfig
      .update({
        where: { channelId },
        data: {
          messageId,
          lastPostedAt: parseOptionalDate(lastPostedAt)
        }
      })
      .catch((error: unknown) => {
        if (isRecordNotFoundError(error)) {
          return undefined
        }

        throw error
      })

    return config ? toStickyMessageConfig(config) : undefined
  }

  async delete(channelId: string): Promise<StickyMessageConfig | undefined> {
    const config = await this.prisma.stickyMessageConfig
      .delete({
        where: { channelId }
      })
      .catch((error: unknown) => {
        if (isRecordNotFoundError(error)) {
          return undefined
        }

        throw error
      })

    return config ? toStickyMessageConfig(config) : undefined
  }

  async deleteByGuild(guildId: string): Promise<number> {
    const result = await this.prisma.stickyMessageConfig.deleteMany({
      where: { guildId }
    })

    return result.count
  }
}

export function normalizeStickyDelaySeconds(value: number | undefined): number {
  if (!Number.isFinite(value)) {
    return defaultStickyDelaySeconds
  }

  return Math.min(
    maxStickyDelaySeconds,
    Math.max(minStickyDelaySeconds, Math.trunc(value ?? defaultStickyDelaySeconds))
  )
}

function normalizeConfig(
  channelId: string,
  config: Partial<StickyMessageConfig>
): StickyMessageConfig {
  return {
    guildId: config.guildId ?? '',
    channelId: config.channelId ?? channelId,
    messageId: config.messageId,
    messageType: config.messageType === 'text' ? 'text' : 'embed',
    title: config.title ?? '',
    description: config.description ?? '',
    color: normalizeColor(config.color),
    delaySeconds: normalizeStickyDelaySeconds(config.delaySeconds),
    lastPostedAt: config.lastPostedAt,
    updatedAt: config.updatedAt ?? new Date(0).toISOString()
  }
}

function toStickyMessageConfig(config: {
  guildId: string
  channelId: string
  messageId: string | null
  messageType: string
  title: string
  description: string
  color: number | null
  delaySeconds: number
  lastPostedAt: Date | null
  updatedAt: Date
}): StickyMessageConfig {
  return {
    guildId: config.guildId,
    channelId: config.channelId,
    messageId: config.messageId ?? undefined,
    messageType: config.messageType === 'TEXT' ? 'text' : 'embed',
    title: config.title,
    description: config.description,
    color: config.color ?? undefined,
    delaySeconds: config.delaySeconds,
    lastPostedAt: config.lastPostedAt?.toISOString(),
    updatedAt: config.updatedAt.toISOString()
  }
}

function toPrismaMessageType(messageType: StickyMessageType): 'TEXT' | 'EMBED' {
  return messageType === 'text' ? 'TEXT' : 'EMBED'
}

function normalizeColor(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return undefined
  }

  if (value < 0 || value > 0xffffff) {
    return undefined
  }

  return value
}

function parseOptionalDate(value: string | undefined): Date | null {
  if (!value) {
    return null
  }

  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? null : date
}

function isRecordNotFoundError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2025'
  )
}
