import type { AppPrismaClient } from '../../../platform/database/prisma'

export type PostRoleConfig = {
  guildId: string
  channelId: string
  roleId: string
  historyLimit: number
  createdAt: string
  updatedAt: string
}

type PostRolePrisma = Pick<AppPrismaClient, 'postRoleConfig'>

export class PostRoleRepository {
  private readonly prisma: PostRolePrisma

  constructor(prisma: PostRolePrisma) {
    this.prisma = prisma
  }

  async get(channelId: string): Promise<PostRoleConfig | undefined> {
    const config = await this.prisma.postRoleConfig.findUnique({
      where: { channelId }
    })

    return config ? toPostRoleConfig(config) : undefined
  }

  async list(): Promise<PostRoleConfig[]> {
    const configs = await this.prisma.postRoleConfig.findMany({
      orderBy: [{ guildId: 'asc' }, { createdAt: 'asc' }]
    })

    return configs.map(toPostRoleConfig)
  }

  async listByGuild(guildId: string): Promise<PostRoleConfig[]> {
    const configs = await this.prisma.postRoleConfig.findMany({
      where: { guildId },
      orderBy: { createdAt: 'asc' }
    })

    return configs.map(toPostRoleConfig)
  }

  async set(input: {
    guildId: string
    channelId: string
    roleId: string
    historyLimit: number
  }): Promise<PostRoleConfig> {
    const config = await this.prisma.postRoleConfig.upsert({
      where: { channelId: input.channelId },
      create: {
        guildId: input.guildId,
        channelId: input.channelId,
        roleId: input.roleId,
        historyLimit: input.historyLimit
      },
      update: {
        guildId: input.guildId,
        roleId: input.roleId,
        historyLimit: input.historyLimit
      }
    })

    return toPostRoleConfig(config)
  }

  async delete(channelId: string): Promise<boolean> {
    const result = await this.prisma.postRoleConfig.deleteMany({
      where: { channelId }
    })

    return result.count > 0
  }

  async deleteByGuild(guildId: string): Promise<number> {
    const result = await this.prisma.postRoleConfig.deleteMany({
      where: { guildId }
    })

    return result.count
  }

  async deleteByRole(guildId: string, roleId: string): Promise<number> {
    const result = await this.prisma.postRoleConfig.deleteMany({
      where: {
        guildId,
        roleId
      }
    })

    return result.count
  }
}

function toPostRoleConfig(config: {
  guildId: string
  channelId: string
  roleId: string
  historyLimit: number
  createdAt: Date
  updatedAt: Date
}): PostRoleConfig {
  return {
    guildId: config.guildId,
    channelId: config.channelId,
    roleId: config.roleId,
    historyLimit: config.historyLimit,
    createdAt: config.createdAt.toISOString(),
    updatedAt: config.updatedAt.toISOString()
  }
}
