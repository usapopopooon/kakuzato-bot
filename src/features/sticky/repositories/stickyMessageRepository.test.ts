import { describe, expect, it, vi } from 'vitest'
import { defaultStickyDelaySeconds, StickyMessageRepository } from './stickyMessageRepository'

type StickyRow = {
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
}

function createRepository() {
  const rows = new Map<string, StickyRow>()
  const stickyMessageConfig = {
    findUnique: vi.fn(
      ({ where }: { where: { channelId: string } }) => rows.get(where.channelId) ?? null
    ),
    findMany: vi.fn(() => [...rows.values()]),
    upsert: vi.fn(
      ({
        where,
        create,
        update
      }: {
        where: { channelId: string }
        create: Omit<StickyRow, 'updatedAt'>
        update: Partial<Omit<StickyRow, 'channelId' | 'updatedAt'>>
      }) => {
        const current = rows.get(where.channelId)
        const row = {
          ...(current ?? create),
          ...update,
          updatedAt: new Date()
        }
        rows.set(where.channelId, row)
        return row
      }
    ),
    update: vi.fn(
      ({
        where,
        data
      }: {
        where: { channelId: string }
        data: Partial<Omit<StickyRow, 'channelId' | 'updatedAt'>>
      }) => {
        const current = rows.get(where.channelId)

        if (!current) {
          return Promise.reject(createPrismaError('P2025'))
        }

        const row = { ...current, ...data, updatedAt: new Date() }
        rows.set(where.channelId, row)
        return Promise.resolve(row)
      }
    ),
    delete: vi.fn(({ where }: { where: { channelId: string } }) => {
      const current = rows.get(where.channelId)

      if (!current) {
        return Promise.reject(createPrismaError('P2025'))
      }

      rows.delete(where.channelId)
      return Promise.resolve(current)
    }),
    deleteMany: vi.fn(({ where }: { where: { guildId: string } }) => {
      let count = 0

      for (const [channelId, row] of rows) {
        if (row.guildId === where.guildId) {
          rows.delete(channelId)
          count += 1
        }
      }

      return { count }
    })
  }

  return {
    repository: new StickyMessageRepository({ stickyMessageConfig } as never)
  }
}

describe('StickyMessageRepository', () => {
  it('stores a text sticky config per channel', async () => {
    const { repository } = createRepository()

    await repository.set({
      guildId: 'guild-1',
      channelId: 'channel-1',
      messageId: 'message-1',
      messageType: 'text',
      title: '',
      description: 'sticky text',
      delaySeconds: 10,
      lastPostedAt: new Date().toISOString()
    })

    await expect(repository.get('channel-1')).resolves.toMatchObject({
      guildId: 'guild-1',
      channelId: 'channel-1',
      messageId: 'message-1',
      messageType: 'text',
      description: 'sticky text',
      delaySeconds: 10
    })
  })

  it('normalizes invalid delay to the default', async () => {
    const { repository } = createRepository()

    await repository.set({
      guildId: 'guild-1',
      channelId: 'channel-1',
      messageType: 'embed',
      title: 'title',
      description: 'description',
      delaySeconds: Number.NaN
    })

    await expect(repository.get('channel-1')).resolves.toMatchObject({
      delaySeconds: defaultStickyDelaySeconds
    })
  })

  it('updates the posted message id', async () => {
    const { repository } = createRepository()
    await repository.set({
      guildId: 'guild-1',
      channelId: 'channel-1',
      messageId: 'old-message',
      messageType: 'text',
      title: '',
      description: 'sticky text',
      delaySeconds: 5
    })

    await expect(
      repository.updateMessage('channel-1', 'new-message', new Date().toISOString())
    ).resolves.toMatchObject({
      messageId: 'new-message'
    })
  })

  it('clears an old embed color when the next config has no color', async () => {
    const { repository } = createRepository()
    await repository.set({
      guildId: 'guild-1',
      channelId: 'channel-1',
      messageType: 'embed',
      title: 'title',
      description: 'colored',
      color: 0xff0000,
      delaySeconds: 5
    })

    await repository.set({
      guildId: 'guild-1',
      channelId: 'channel-1',
      messageType: 'embed',
      title: 'title',
      description: 'default color',
      delaySeconds: 5
    })

    await expect(repository.get('channel-1')).resolves.toMatchObject({
      description: 'default color',
      color: undefined
    })
  })

  it('deletes configs by guild', async () => {
    const { repository } = createRepository()
    await repository.set({
      guildId: 'guild-1',
      channelId: 'channel-1',
      messageType: 'text',
      title: '',
      description: 'one',
      delaySeconds: 5
    })
    await repository.set({
      guildId: 'guild-2',
      channelId: 'channel-2',
      messageType: 'text',
      title: '',
      description: 'two',
      delaySeconds: 5
    })

    await expect(repository.deleteByGuild('guild-1')).resolves.toBe(1)
    await expect(repository.get('channel-1')).resolves.toBeUndefined()
    await expect(repository.get('channel-2')).resolves.toMatchObject({
      guildId: 'guild-2'
    })
  })
})

function createPrismaError(code: string): Error & { code: string } {
  const error = new Error(code) as Error & { code: string }
  error.code = code
  return error
}
