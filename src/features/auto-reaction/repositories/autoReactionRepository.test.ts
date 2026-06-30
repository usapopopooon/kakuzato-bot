import { describe, expect, it, vi } from 'vitest'
import { AutoReactionRepository } from './autoReactionRepository'

type AutoReactionConfigRow = {
  guildId: string
  channelId: string
  emojis: string[]
  createdAt: Date
  updatedAt: Date
}

function createRepository() {
  const rows = new Map<string, AutoReactionConfigRow>()

  const autoReactionConfig = {
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
        create: Omit<AutoReactionConfigRow, 'createdAt' | 'updatedAt'>
        update: Partial<Omit<AutoReactionConfigRow, 'channelId' | 'createdAt' | 'updatedAt'>>
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
    deleteMany: vi.fn(({ where }: { where: { channelId?: string; guildId?: string } }) => {
      let count = 0

      for (const [channelId, row] of rows) {
        if (
          (!where.channelId || row.channelId === where.channelId) &&
          (!where.guildId || row.guildId === where.guildId)
        ) {
          rows.delete(channelId)
          count += 1
        }
      }

      return { count }
    })
  }

  return {
    repository: new AutoReactionRepository({ autoReactionConfig } as never)
  }
}

describe('AutoReactionRepository', () => {
  it('stores and updates auto reaction configs by channel', async () => {
    const { repository } = createRepository()

    await repository.set({
      guildId: 'guild-1',
      channelId: 'channel-1',
      emojis: ['👍']
    })
    await repository.set({
      guildId: 'guild-1',
      channelId: 'channel-1',
      emojis: ['👍', '❤️']
    })

    await expect(repository.get('channel-1')).resolves.toMatchObject({
      guildId: 'guild-1',
      channelId: 'channel-1',
      emojis: ['👍', '❤️']
    })
  })

  it('lists and deletes configs by guild or channel', async () => {
    const { repository } = createRepository()

    await repository.set({
      guildId: 'guild-1',
      channelId: 'channel-1',
      emojis: ['👍']
    })
    await repository.set({
      guildId: 'guild-1',
      channelId: 'channel-2',
      emojis: ['❤️']
    })
    await repository.set({
      guildId: 'guild-2',
      channelId: 'channel-3',
      emojis: ['🔥']
    })

    await expect(repository.listByGuild('guild-1')).resolves.toHaveLength(2)
    await expect(repository.delete('channel-1')).resolves.toBe(true)
    await expect(repository.deleteByGuild('guild-1')).resolves.toBe(1)
    await expect(repository.list()).resolves.toMatchObject([{ channelId: 'channel-3' }])
  })
})
