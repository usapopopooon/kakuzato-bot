import { describe, expect, it, vi } from 'vitest'
import { BumpRepository } from './bumpRepository'

type ReminderRow = {
  id: number
  guildId: string
  channelId: string
  serviceKey: string
  remindAt: Date | null
  isEnabled: boolean
  roleId: string | null
  createdAt: Date
  updatedAt: Date
}

function createRepository() {
  const configs = new Map<
    string,
    { guildId: string; channelId: string; createdAt: Date; updatedAt: Date }
  >()
  const reminders: ReminderRow[] = []
  let nextReminderId = 1

  const findReminder = (guildId: string, serviceKey: string) =>
    reminders.find((reminder) => reminder.guildId === guildId && reminder.serviceKey === serviceKey)

  const bumpConfig = {
    findUnique: vi.fn(
      ({ where }: { where: { guildId: string } }) => configs.get(where.guildId) ?? null
    ),
    findMany: vi.fn(() => [...configs.values()]),
    upsert: vi.fn(
      ({
        where,
        create,
        update
      }: {
        where: { guildId: string }
        create: { guildId: string; channelId: string }
        update: { channelId: string }
      }) => {
        const current = configs.get(where.guildId)
        const row = {
          guildId: where.guildId,
          channelId: current ? update.channelId : create.channelId,
          createdAt: current?.createdAt ?? new Date(),
          updatedAt: new Date()
        }
        configs.set(where.guildId, row)
        return row
      }
    ),
    deleteMany: vi.fn(({ where }: { where: { guildId: string } }) => {
      const deleted = configs.delete(where.guildId)
      return { count: deleted ? 1 : 0 }
    })
  }

  const bumpReminder = {
    findUnique: vi.fn(
      ({ where }: { where: { guildId_serviceKey: { guildId: string; serviceKey: string } } }) =>
        findReminder(where.guildId_serviceKey.guildId, where.guildId_serviceKey.serviceKey) ?? null
    ),
    findMany: vi.fn(
      ({
        where
      }: {
        where?: { guildId?: string; isEnabled?: boolean; remindAt?: { lte: Date } }
      }) =>
        reminders.filter((reminder) => {
          if (where?.guildId && reminder.guildId !== where.guildId) {
            return false
          }

          if (where?.isEnabled !== undefined && reminder.isEnabled !== where.isEnabled) {
            return false
          }

          if (
            where?.remindAt?.lte &&
            (!reminder.remindAt || reminder.remindAt > where.remindAt.lte)
          ) {
            return false
          }

          return true
        })
    ),
    upsert: vi.fn(
      ({
        where,
        create,
        update
      }: {
        where: { guildId_serviceKey: { guildId: string; serviceKey: string } }
        create: Partial<ReminderRow> & { guildId: string; serviceKey: string }
        update: Partial<ReminderRow>
      }) => {
        const current = findReminder(
          where.guildId_serviceKey.guildId,
          where.guildId_serviceKey.serviceKey
        )

        if (current) {
          Object.assign(current, update, { updatedAt: new Date() })
          return current
        }

        const row = createReminder(create)
        reminders.push(row)
        return row
      }
    ),
    create: vi.fn(
      ({ data }: { data: Partial<ReminderRow> & { guildId: string; serviceKey: string } }) => {
        if (findReminder(data.guildId, data.serviceKey)) {
          throw createPrismaError('P2002')
        }

        const row = createReminder(data)
        reminders.push(row)
        return row
      }
    ),
    update: vi.fn(
      ({
        where,
        data
      }: {
        where: { guildId_serviceKey: { guildId: string; serviceKey: string } }
        data: Partial<ReminderRow>
      }) => {
        const current = findReminder(
          where.guildId_serviceKey.guildId,
          where.guildId_serviceKey.serviceKey
        )

        if (!current) {
          throw createPrismaError('P2025')
        }

        Object.assign(current, data, { updatedAt: new Date() })
        return current
      }
    ),
    updateMany: vi.fn(
      ({
        where,
        data
      }: {
        where: {
          id?: number
          guildId?: string
          isEnabled?: boolean
          serviceKey?: string
          remindAt?: { not?: null; lte?: Date; equals?: Date }
          OR?: { remindAt: null | { lte: Date } }[]
        }
        data: Partial<ReminderRow>
      }) => {
        let count = 0

        for (const reminder of reminders) {
          if (where.id !== undefined && reminder.id !== where.id) {
            continue
          }

          if (where.guildId && reminder.guildId !== where.guildId) {
            continue
          }

          if (where.serviceKey && reminder.serviceKey !== where.serviceKey) {
            continue
          }

          if (where.isEnabled !== undefined && reminder.isEnabled !== where.isEnabled) {
            continue
          }

          if (where.remindAt?.not === null && reminder.remindAt === null) {
            continue
          }

          if (
            where.remindAt?.lte &&
            (!reminder.remindAt || reminder.remindAt > where.remindAt.lte)
          ) {
            continue
          }

          if (
            where.remindAt?.equals &&
            reminder.remindAt?.getTime() !== where.remindAt.equals.getTime()
          ) {
            continue
          }

          if (
            where.OR &&
            !where.OR.some((condition) => matchesRemindAtCondition(reminder, condition.remindAt))
          ) {
            continue
          }

          Object.assign(reminder, data, { updatedAt: new Date() })
          count += 1
        }

        return { count }
      }
    ),
    deleteMany: vi.fn(({ where }: { where: { guildId: string } }) => {
      const before = reminders.length

      for (let index = reminders.length - 1; index >= 0; index -= 1) {
        if (reminders[index]?.guildId === where.guildId) {
          reminders.splice(index, 1)
        }
      }

      return { count: before - reminders.length }
    })
  }

  function createReminder(
    input: Partial<ReminderRow> & { guildId: string; serviceKey: string }
  ): ReminderRow {
    const id = nextReminderId
    nextReminderId += 1

    return {
      id,
      guildId: input.guildId,
      channelId: input.channelId ?? '',
      serviceKey: input.serviceKey,
      remindAt: input.remindAt ?? null,
      isEnabled: input.isEnabled ?? true,
      roleId: input.roleId ?? null,
      createdAt: new Date(),
      updatedAt: new Date()
    }
  }

  return {
    repository: new BumpRepository({ bumpConfig, bumpReminder } as never),
    reminders
  }
}

describe('BumpRepository', () => {
  it('stores the monitored channel per guild', async () => {
    const { repository } = createRepository()

    await expect(repository.setConfig('guild-1', 'channel-1')).resolves.toMatchObject({
      guildId: 'guild-1',
      channelId: 'channel-1'
    })
    await expect(repository.getConfig('guild-1')).resolves.toMatchObject({
      channelId: 'channel-1'
    })
  })

  it('claims the first bump detection and rejects a duplicate within 60 seconds', async () => {
    const { repository } = createRepository()
    const remindAt = new Date('2026-06-24T12:00:00.000Z')

    await expect(
      repository.claimBumpDetection('guild-1', 'channel-1', 'DISBOARD', remindAt)
    ).resolves.toMatchObject({
      guildId: 'guild-1',
      channelId: 'channel-1',
      serviceKey: 'DISBOARD'
    })
    await expect(
      repository.claimBumpDetection(
        'guild-1',
        'channel-1',
        'DISBOARD',
        new Date(remindAt.getTime() + 30_000)
      )
    ).resolves.toBeUndefined()
  })

  it('claims and clears due reminders atomically', async () => {
    const { repository, reminders } = createRepository()
    const remindAt = new Date('2026-06-24T12:00:00.000Z')
    const now = new Date('2026-06-24T12:00:01.000Z')
    const retryAt = new Date('2026-06-24T12:01:01.000Z')
    const reminder = await repository.upsertReminder('guild-1', 'channel-1', 'DISSOKU', remindAt)

    await expect(repository.getDueReminders(now)).resolves.toHaveLength(1)
    await expect(repository.claimDueReminder(reminder.id, now, retryAt)).resolves.toBe(true)
    await expect(repository.claimDueReminder(reminder.id, now, retryAt)).resolves.toBe(false)
    expect(reminders[0]?.remindAt?.toISOString()).toBe(retryAt.toISOString())
    await expect(repository.clearReminder(reminder.id, retryAt)).resolves.toBe(true)
    expect(reminders[0]?.remindAt).toBeNull()
    await expect(repository.clearReminder(reminder.id)).resolves.toBe(false)
  })

  it('clears a custom reminder role when role id is undefined', async () => {
    const { repository, reminders } = createRepository()
    await repository.setReminderRole('guild-1', 'DISBOARD', 'role-1')

    await expect(
      repository.setReminderRole('guild-1', 'DISBOARD', undefined)
    ).resolves.toMatchObject({
      roleId: undefined
    })
    expect(reminders[0]?.roleId).toBeNull()
  })
})

function matchesRemindAtCondition(reminder: ReminderRow, condition: null | { lte: Date }): boolean {
  if (condition === null) {
    return reminder.remindAt === null
  }

  return reminder.remindAt !== null && reminder.remindAt <= condition.lte
}

function createPrismaError(code: string): Error & { code: string } {
  const error = new Error(code) as Error & { code: string }
  error.code = code
  return error
}
