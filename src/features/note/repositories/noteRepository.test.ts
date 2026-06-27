import { describe, expect, it, vi } from 'vitest'
import { NoteRepository } from './noteRepository'

type NoteConfigRow = {
  guildId: string
  lobbyChannelId: string
  panelMessageId: string | null
  categoryBaseName: string
  archiveCategoryBaseName: string
  channelNamePrefix: string
  creatorRoleId: string | null
  managerRoleId: string | null
  createdAt: Date
  updatedAt: Date
}

type NoteCategoryRow = {
  id: number
  guildId: string
  categoryId: string
  kind: string
  sortOrder: number
  createdAt: Date
  updatedAt: Date
}

type NoteChannelRow = {
  id: number
  guildId: string
  userId: string
  channelId: string
  categoryId: string
  status: string
  visibility: string
  commentMode: string
  archivedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

function createRepository() {
  const configs = new Map<string, NoteConfigRow>()
  const categories = new Map<string, NoteCategoryRow>()
  const notesByUser = new Map<string, NoteChannelRow>()
  const notesByChannel = new Map<string, NoteChannelRow>()
  let categoryId = 1
  let noteId = 1

  const noteConfig = {
    findUnique: vi.fn(
      ({ where }: { where: { guildId: string } }) => configs.get(where.guildId) ?? null
    ),
    upsert: vi.fn(
      ({
        where,
        create,
        update
      }: {
        where: { guildId: string }
        create: Omit<NoteConfigRow, 'createdAt' | 'updatedAt'>
        update: Partial<Omit<NoteConfigRow, 'guildId' | 'createdAt' | 'updatedAt'>>
      }) => {
        const current = configs.get(where.guildId)
        const row = {
          ...(current ?? { ...create, createdAt: new Date() }),
          ...update,
          updatedAt: new Date()
        }
        configs.set(where.guildId, row)
        return row
      }
    ),
    update: vi.fn(
      ({ where, data }: { where: { guildId: string }; data: Partial<NoteConfigRow> }) => {
        const current = configs.get(where.guildId)

        if (!current) {
          return Promise.reject(createPrismaError('P2025'))
        }

        const row = { ...current, ...data, updatedAt: new Date() }
        configs.set(where.guildId, row)
        return Promise.resolve(row)
      }
    ),
    deleteMany: vi.fn(({ where }: { where: { guildId: string } }) => {
      const deleted = configs.delete(where.guildId)
      return { count: deleted ? 1 : 0 }
    })
  }

  const noteCategory = {
    findMany: vi.fn(({ where }: { where: { guildId: string; kind: string } }) =>
      [...categories.values()]
        .filter((row) => row.guildId === where.guildId && row.kind === where.kind)
        .sort((left, right) => left.sortOrder - right.sortOrder)
    ),
    upsert: vi.fn(
      ({
        where,
        create,
        update
      }: {
        where: { guildId_categoryId: { guildId: string; categoryId: string } }
        create: Omit<NoteCategoryRow, 'id' | 'createdAt' | 'updatedAt'>
        update: Partial<
          Omit<NoteCategoryRow, 'id' | 'guildId' | 'categoryId' | 'createdAt' | 'updatedAt'>
        >
      }) => {
        const key = `${where.guildId_categoryId.guildId}:${where.guildId_categoryId.categoryId}`
        const current = categories.get(key)
        const row = {
          ...(current ?? { ...create, id: categoryId, createdAt: new Date() }),
          ...update,
          updatedAt: new Date()
        }
        categoryId += current ? 0 : 1
        categories.set(key, row)
        return row
      }
    ),
    deleteMany: vi.fn(({ where }: { where: { guildId: string; categoryId?: string } }) => {
      let count = 0

      for (const [key, row] of categories) {
        if (
          row.guildId === where.guildId &&
          (!where.categoryId || row.categoryId === where.categoryId)
        ) {
          categories.delete(key)
          count += 1
        }
      }

      return { count }
    })
  }

  const noteChannel = {
    findUnique: vi.fn(
      ({
        where
      }: {
        where: { channelId?: string; guildId_userId?: { guildId: string; userId: string } }
      }) => {
        if (where.channelId) {
          return notesByChannel.get(where.channelId) ?? null
        }

        if (where.guildId_userId) {
          return (
            notesByUser.get(`${where.guildId_userId.guildId}:${where.guildId_userId.userId}`) ??
            null
          )
        }

        return null
      }
    ),
    upsert: vi.fn(
      ({
        where,
        create,
        update
      }: {
        where: { guildId_userId: { guildId: string; userId: string } }
        create: Omit<NoteChannelRow, 'id' | 'createdAt' | 'updatedAt'>
        update: Partial<
          Omit<NoteChannelRow, 'id' | 'guildId' | 'userId' | 'createdAt' | 'updatedAt'>
        >
      }) => {
        const key = `${where.guildId_userId.guildId}:${where.guildId_userId.userId}`
        const current = notesByUser.get(key)
        const row = {
          ...(current ?? { ...create, id: noteId, createdAt: new Date() }),
          ...update,
          updatedAt: new Date()
        }
        noteId += current ? 0 : 1
        notesByUser.set(key, row)
        notesByChannel.set(row.channelId, row)
        return row
      }
    ),
    update: vi.fn(
      ({
        where,
        data
      }: {
        where: { guildId_userId: { guildId: string; userId: string } }
        data: Partial<NoteChannelRow>
      }) => {
        const key = `${where.guildId_userId.guildId}:${where.guildId_userId.userId}`
        const current = notesByUser.get(key)

        if (!current) {
          return Promise.reject(createPrismaError('P2025'))
        }

        const row = { ...current, ...data, updatedAt: new Date() }
        notesByUser.set(key, row)
        notesByChannel.delete(current.channelId)
        notesByChannel.set(row.channelId, row)
        return Promise.resolve(row)
      }
    ),
    deleteMany: vi.fn(
      ({ where }: { where: { guildId?: string; userId?: string; channelId?: string } }) => {
        let count = 0

        for (const [key, row] of notesByUser) {
          if (
            (!where.guildId || row.guildId === where.guildId) &&
            (!where.userId || row.userId === where.userId) &&
            (!where.channelId || row.channelId === where.channelId)
          ) {
            notesByUser.delete(key)
            notesByChannel.delete(row.channelId)
            count += 1
          }
        }

        return { count }
      }
    ),
    count: vi.fn(
      ({ where }: { where: { guildId: string; status: string } }) =>
        [...notesByUser.values()].filter(
          (row) => row.guildId === where.guildId && row.status === where.status
        ).length
    )
  }

  return {
    repository: new NoteRepository({ noteConfig, noteCategory, noteChannel } as never)
  }
}

describe('NoteRepository', () => {
  it('stores note panel configuration per guild', async () => {
    const { repository } = createRepository()

    await repository.setConfig({
      guildId: 'guild-1',
      lobbyChannelId: 'lobby-1',
      panelMessageId: undefined,
      categoryBaseName: 'ノート',
      archiveCategoryBaseName: 'ノート Archive',
      channelNamePrefix: 'note',
      creatorRoleId: 'creator-role-1',
      managerRoleId: undefined
    })
    await repository.updatePanelMessage('guild-1', 'message-1')

    await expect(repository.getConfig('guild-1')).resolves.toMatchObject({
      guildId: 'guild-1',
      lobbyChannelId: 'lobby-1',
      panelMessageId: 'message-1',
      creatorRoleId: 'creator-role-1',
      managerRoleId: undefined
    })
  })

  it('lists managed categories by kind and sort order', async () => {
    const { repository } = createRepository()

    await repository.addCategory({
      guildId: 'guild-1',
      categoryId: 'category-2',
      kind: 'active',
      sortOrder: 2
    })
    await repository.addCategory({
      guildId: 'guild-1',
      categoryId: 'category-1',
      kind: 'active',
      sortOrder: 1
    })
    await repository.addCategory({
      guildId: 'guild-1',
      categoryId: 'archive-1',
      kind: 'archive',
      sortOrder: 1
    })

    await expect(repository.listCategories('guild-1', 'active')).resolves.toMatchObject([
      { categoryId: 'category-1', sortOrder: 1 },
      { categoryId: 'category-2', sortOrder: 2 }
    ])
  })

  it('stores and updates a user note state', async () => {
    const { repository } = createRepository()

    await repository.createNote({
      guildId: 'guild-1',
      userId: 'user-1',
      channelId: 'channel-1',
      categoryId: 'category-1',
      visibility: 'public',
      commentMode: 'open'
    })
    await repository.updateNoteState('guild-1', 'user-1', {
      categoryId: 'archive-1',
      status: 'archived',
      visibility: 'private',
      commentMode: 'locked',
      archivedAt: new Date('2026-06-27T00:00:00.000Z').toISOString()
    })

    await expect(repository.getNoteByUser('guild-1', 'user-1')).resolves.toMatchObject({
      channelId: 'channel-1',
      categoryId: 'archive-1',
      status: 'archived',
      visibility: 'private',
      commentMode: 'locked'
    })
  })

  it('counts active and archived notes', async () => {
    const { repository } = createRepository()

    await repository.createNote({
      guildId: 'guild-1',
      userId: 'user-1',
      channelId: 'channel-1',
      categoryId: 'category-1',
      visibility: 'public',
      commentMode: 'open'
    })
    await repository.createNote({
      guildId: 'guild-1',
      userId: 'user-2',
      channelId: 'channel-2',
      categoryId: 'category-1',
      visibility: 'public',
      commentMode: 'open'
    })
    await repository.updateNoteState('guild-1', 'user-2', {
      status: 'archived',
      archivedAt: new Date().toISOString()
    })

    await expect(repository.countNotes('guild-1')).resolves.toEqual({
      active: 1,
      archived: 1
    })
  })
})

function createPrismaError(code: string): Error & { code: string } {
  const error = new Error(code) as Error & { code: string }
  error.code = code
  return error
}
