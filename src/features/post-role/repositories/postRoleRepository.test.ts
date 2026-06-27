import { describe, expect, it, vi } from 'vitest'
import { PostRoleRepository } from './postRoleRepository'

type PostRoleConfigRow = {
  guildId: string
  channelId: string
  roleId: string
  historyLimit: number
  createdAt: Date
  updatedAt: Date
}

function createRepository() {
  const rows = new Map<string, PostRoleConfigRow>()

  const postRoleConfig = {
    findUnique: vi.fn(
      ({ where }: { where: { channelId: string } }) => rows.get(where.channelId) ?? null
    ),
    findMany: vi.fn(({ where }: { where?: { guildId?: string } } = {}) =>
      [...rows.values()]
        .filter((row) => !where?.guildId || row.guildId === where.guildId)
        .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
    ),
    upsert: vi.fn(
      ({
        where,
        create,
        update
      }: {
        where: { channelId: string }
        create: Omit<PostRoleConfigRow, 'createdAt' | 'updatedAt'>
        update: Partial<Omit<PostRoleConfigRow, 'channelId' | 'createdAt' | 'updatedAt'>>
      }) => {
        const current = rows.get(where.channelId)
        const row = {
          ...(current ?? { ...create, createdAt: new Date() }),
          ...update,
          updatedAt: new Date()
        }
        rows.set(where.channelId, row)
        return row
      }
    ),
    deleteMany: vi.fn(
      ({ where }: { where: { channelId?: string; guildId?: string; roleId?: string } }) => {
      let count = 0

      for (const [channelId, row] of rows) {
        if (
          (!where.channelId || row.channelId === where.channelId) &&
          (!where.guildId || row.guildId === where.guildId) &&
          (!where.roleId || row.roleId === where.roleId)
        ) {
          rows.delete(channelId)
          count += 1
        }
      }

      return { count }
      }
    )
  }

  return {
    repository: new PostRoleRepository({ postRoleConfig } as never)
  }
}

describe('PostRoleRepository', () => {
  it('stores and updates post role configs by channel', async () => {
    const { repository } = createRepository()

    await repository.set({
      guildId: 'guild-1',
      channelId: 'channel-1',
      roleId: 'role-1',
      historyLimit: 500
    })
    await repository.set({
      guildId: 'guild-1',
      channelId: 'channel-1',
      roleId: 'role-2',
      historyLimit: 1000
    })

    await expect(repository.get('channel-1')).resolves.toMatchObject({
      guildId: 'guild-1',
      channelId: 'channel-1',
      roleId: 'role-2',
      historyLimit: 1000
    })
  })

  it('lists and deletes configs by guild or channel', async () => {
    const { repository } = createRepository()

    await repository.set({
      guildId: 'guild-1',
      channelId: 'channel-1',
      roleId: 'role-1',
      historyLimit: 500
    })
    await repository.set({
      guildId: 'guild-1',
      channelId: 'channel-2',
      roleId: 'role-2',
      historyLimit: 500
    })
    await repository.set({
      guildId: 'guild-2',
      channelId: 'channel-3',
      roleId: 'role-3',
      historyLimit: 500
    })

    await expect(repository.listByGuild('guild-1')).resolves.toHaveLength(2)
    await expect(repository.delete('channel-1')).resolves.toBe(true)
    await expect(repository.deleteByGuild('guild-1')).resolves.toBe(1)
    await expect(repository.list()).resolves.toMatchObject([{ channelId: 'channel-3' }])
  })

  it('deletes configs by role', async () => {
    const { repository } = createRepository()

    await repository.set({
      guildId: 'guild-1',
      channelId: 'channel-1',
      roleId: 'role-1',
      historyLimit: 500
    })
    await repository.set({
      guildId: 'guild-1',
      channelId: 'channel-2',
      roleId: 'role-2',
      historyLimit: 500
    })

    await expect(repository.deleteByRole('guild-1', 'role-1')).resolves.toBe(1)
    await expect(repository.listByGuild('guild-1')).resolves.toMatchObject([
      { channelId: 'channel-2' }
    ])
  })
})
