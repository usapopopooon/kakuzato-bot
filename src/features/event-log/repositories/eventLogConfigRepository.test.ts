import { describe, expect, it, vi } from 'vitest'
import { eventLogCategories } from '../eventLogCategories'
import { EventLogConfigRepository } from './eventLogConfigRepository'

type EventLogRow = {
  guildId: string
  channelId: string
  enabled: boolean
  enabledCategories: string[]
  updatedAt: Date
}

function createRepository() {
  const rows = new Map<string, EventLogRow>()
  const eventLogConfig = {
    findUnique: vi.fn(
      ({ where }: { where: { guildId: string } }) => rows.get(where.guildId) ?? null
    ),
    upsert: vi.fn(
      ({
        where,
        create,
        update
      }: {
        where: { guildId: string }
        create: Omit<EventLogRow, 'updatedAt'>
        update: Partial<Omit<EventLogRow, 'guildId' | 'updatedAt'>>
      }) => {
        const current = rows.get(where.guildId)
        const row = {
          ...(current ?? create),
          ...update,
          updatedAt: new Date()
        }
        rows.set(where.guildId, row)
        return row
      }
    ),
    update: vi.fn(
      ({
        where,
        data
      }: {
        where: { guildId: string }
        data: Partial<Omit<EventLogRow, 'guildId' | 'updatedAt'>>
      }) => {
        const current = rows.get(where.guildId)

        if (!current) {
          return Promise.reject(createPrismaError('P2025'))
        }

        const row = { ...current, ...data, updatedAt: new Date() }
        rows.set(where.guildId, row)
        return Promise.resolve(row)
      }
    )
  }

  return {
    repository: new EventLogConfigRepository({ eventLogConfig } as never)
  }
}

describe('EventLogConfigRepository', () => {
  it('stores an enabled channel config per guild', async () => {
    const { repository } = createRepository()

    const config = await repository.setChannel('guild-1', 'channel-1')

    expect(config).toMatchObject({
      guildId: 'guild-1',
      channelId: 'channel-1',
      enabled: true,
      enabledCategories: eventLogCategories
    })
    await expect(repository.get('guild-1')).resolves.toMatchObject({
      channelId: 'channel-1',
      enabled: true,
      enabledCategories: eventLogCategories
    })
  })

  it('toggles a category while preserving the channel config', async () => {
    const { repository } = createRepository()
    await repository.setChannel('guild-1', 'channel-1')

    await expect(repository.setCategory('guild-1', 'voice', false)).resolves.toMatchObject({
      channelId: 'channel-1',
      enabledCategories: eventLogCategories.filter((category) => category !== 'voice')
    })
    await expect(repository.setCategory('guild-1', 'voice', true)).resolves.toMatchObject({
      channelId: 'channel-1',
      enabledCategories: eventLogCategories
    })
  })

  it('preserves an empty category list when all event logs are disabled', async () => {
    const { repository } = createRepository()
    await repository.setChannel('guild-1', 'channel-1')

    for (const category of eventLogCategories) {
      await repository.setCategory('guild-1', category, false)
    }

    await expect(repository.get('guild-1')).resolves.toMatchObject({
      channelId: 'channel-1',
      enabled: true,
      enabledCategories: []
    })
  })

  it('returns undefined when toggling a category before setup', async () => {
    const { repository } = createRepository()

    await expect(repository.setCategory('guild-1', 'voice', false)).resolves.toBeUndefined()
  })

  it('disables an existing config without removing the channel', async () => {
    const { repository } = createRepository()
    await repository.setChannel('guild-1', 'channel-1')

    await expect(repository.disable('guild-1')).resolves.toMatchObject({
      channelId: 'channel-1',
      enabled: false
    })
    await expect(repository.get('guild-1')).resolves.toMatchObject({
      channelId: 'channel-1',
      enabled: false
    })
  })
})

function createPrismaError(code: string): Error & { code: string } {
  const error = new Error(code) as Error & { code: string }
  error.code = code
  return error
}
