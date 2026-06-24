import { describe, expect, it, vi } from 'vitest'
import { VoiceNotifyRepository } from './voiceNotifyRepository'

type VoiceNotifyRow = {
  id: number
  guildId: string
  voiceChannelId: string
  notifyChannelId: string
  createdAt: Date
  updatedAt: Date
}

function createRepository() {
  const rows = new Map<string, VoiceNotifyRow>()
  let nextId = 1
  const key = (guildId: string, voiceChannelId: string) => `${guildId}:${voiceChannelId}`

  const voiceNotifyConfig = {
    findUnique: vi.fn(
      ({
        where
      }: {
        where: { guildId_voiceChannelId: { guildId: string; voiceChannelId: string } }
      }) =>
        rows.get(
          key(where.guildId_voiceChannelId.guildId, where.guildId_voiceChannelId.voiceChannelId)
        ) ?? null
    ),
    findMany: vi.fn(
      ({
        where
      }: {
        where: { guildId?: string; voiceChannelId?: string }
        orderBy?: { createdAt: 'asc' }
      }) =>
        [...rows.values()]
          .filter((row) => {
            if (where.guildId && row.guildId !== where.guildId) {
              return false
            }

            if (where.voiceChannelId && row.voiceChannelId !== where.voiceChannelId) {
              return false
            }

            return true
          })
          .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
    ),
    upsert: vi.fn(
      ({
        where,
        create,
        update
      }: {
        where: { guildId_voiceChannelId: { guildId: string; voiceChannelId: string } }
        create: { guildId: string; voiceChannelId: string; notifyChannelId: string }
        update: { notifyChannelId: string }
      }) => {
        const rowKey = key(
          where.guildId_voiceChannelId.guildId,
          where.guildId_voiceChannelId.voiceChannelId
        )
        const current = rows.get(rowKey)
        const now = new Date()
        const row = current
          ? { ...current, notifyChannelId: update.notifyChannelId, updatedAt: now }
          : {
              id: nextId,
              guildId: create.guildId,
              voiceChannelId: create.voiceChannelId,
              notifyChannelId: create.notifyChannelId,
              createdAt: now,
              updatedAt: now
            }

        nextId += current ? 0 : 1
        rows.set(rowKey, row)
        return row
      }
    ),
    deleteMany: vi.fn(
      ({
        where
      }: {
        where: {
          guildId?: string
          voiceChannelId?: string
          OR?: { voiceChannelId?: string; notifyChannelId?: string }[]
        }
      }) => {
        let count = 0

        for (const [rowKey, row] of rows.entries()) {
          if (where.guildId && row.guildId !== where.guildId) {
            continue
          }

          if (where.voiceChannelId && row.voiceChannelId !== where.voiceChannelId) {
            continue
          }

          if (
            where.OR &&
            !where.OR.some(
              (condition) =>
                condition.voiceChannelId === row.voiceChannelId ||
                condition.notifyChannelId === row.notifyChannelId
            )
          ) {
            continue
          }

          rows.delete(rowKey)
          count += 1
        }

        return { count }
      }
    )
  }

  return {
    repository: new VoiceNotifyRepository({ voiceNotifyConfig } as never)
  }
}

describe('VoiceNotifyRepository', () => {
  it('stores and lists voice notification configs per guild', async () => {
    const { repository } = createRepository()

    await repository.set('guild-1', 'voice-1', 'notify-1')
    await repository.set('guild-1', 'voice-2', 'notify-2')
    await repository.set('guild-2', 'voice-3', 'notify-3')

    await expect(repository.get('guild-1', 'voice-1')).resolves.toMatchObject({
      guildId: 'guild-1',
      voiceChannelId: 'voice-1',
      notifyChannelId: 'notify-1'
    })
    await expect(repository.listByGuild('guild-1')).resolves.toHaveLength(2)
    await expect(repository.listByVoiceChannel('guild-1', 'voice-2')).resolves.toMatchObject([
      {
        voiceChannelId: 'voice-2',
        notifyChannelId: 'notify-2'
      }
    ])
  })

  it('updates the notification channel for an existing watched voice channel', async () => {
    const { repository } = createRepository()

    await repository.set('guild-1', 'voice-1', 'notify-1')
    await repository.set('guild-1', 'voice-1', 'notify-2')

    await expect(repository.get('guild-1', 'voice-1')).resolves.toMatchObject({
      notifyChannelId: 'notify-2'
    })
    await expect(repository.listByGuild('guild-1')).resolves.toHaveLength(1)
  })

  it('deletes configs by watched voice channel, guild, or related channel', async () => {
    const { repository } = createRepository()

    await repository.set('guild-1', 'voice-1', 'notify-1')
    await repository.set('guild-1', 'voice-2', 'notify-2')
    await repository.set('guild-1', 'voice-3', 'notify-1')
    await repository.set('guild-2', 'voice-1', 'notify-1')

    await expect(repository.delete('guild-1', 'voice-2')).resolves.toBe(true)
    await expect(repository.deleteByChannel('guild-1', 'notify-1')).resolves.toBe(2)
    await expect(repository.deleteByGuild('guild-2')).resolves.toBe(1)
    await expect(repository.listByGuild('guild-1')).resolves.toEqual([])
  })
})
