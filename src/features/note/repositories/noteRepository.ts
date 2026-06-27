import type { AppPrismaClient } from '../../../platform/database/prisma'

export type NoteCategoryKind = 'active' | 'archive'
export type NoteChannelStatus = 'active' | 'archived'
export type NoteVisibility = 'public' | 'private'
export type NoteCommentMode = 'open' | 'locked'

export type NoteConfig = {
  guildId: string
  lobbyChannelId: string
  panelMessageId?: string
  categoryBaseName: string
  archiveCategoryBaseName: string
  channelNamePrefix: string
  creatorRoleId?: string
  managerRoleId?: string
  createdAt: string
  updatedAt: string
}

export type NoteCategory = {
  id: number
  guildId: string
  categoryId: string
  kind: NoteCategoryKind
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export type NoteChannel = {
  id: number
  guildId: string
  userId: string
  channelId: string
  categoryId: string
  status: NoteChannelStatus
  visibility: NoteVisibility
  commentMode: NoteCommentMode
  archivedAt?: string
  createdAt: string
  updatedAt: string
}

type NotePrisma = Pick<AppPrismaClient, 'noteConfig' | 'noteCategory' | 'noteChannel'>

export type NoteConfigInput = {
  guildId: string
  lobbyChannelId: string
  panelMessageId?: string
  categoryBaseName: string
  archiveCategoryBaseName: string
  channelNamePrefix: string
  creatorRoleId?: string
  managerRoleId?: string
}

export type NoteChannelInput = {
  guildId: string
  userId: string
  channelId: string
  categoryId: string
  visibility: NoteVisibility
  commentMode: NoteCommentMode
}

export class NoteRepository {
  private readonly prisma: NotePrisma

  constructor(prisma: NotePrisma) {
    this.prisma = prisma
  }

  async getConfig(guildId: string): Promise<NoteConfig | undefined> {
    const config = await this.prisma.noteConfig.findUnique({
      where: { guildId }
    })

    return config ? toNoteConfig(config) : undefined
  }

  async setConfig(input: NoteConfigInput): Promise<NoteConfig> {
    const config = await this.prisma.noteConfig.upsert({
      where: { guildId: input.guildId },
      create: {
        guildId: input.guildId,
        lobbyChannelId: input.lobbyChannelId,
        panelMessageId: input.panelMessageId ?? null,
        categoryBaseName: input.categoryBaseName,
        archiveCategoryBaseName: input.archiveCategoryBaseName,
        channelNamePrefix: input.channelNamePrefix,
        creatorRoleId: input.creatorRoleId ?? null,
        managerRoleId: input.managerRoleId ?? null
      },
      update: {
        lobbyChannelId: input.lobbyChannelId,
        panelMessageId: input.panelMessageId ?? null,
        categoryBaseName: input.categoryBaseName,
        archiveCategoryBaseName: input.archiveCategoryBaseName,
        channelNamePrefix: input.channelNamePrefix,
        creatorRoleId: input.creatorRoleId ?? null,
        managerRoleId: input.managerRoleId ?? null
      }
    })

    return toNoteConfig(config)
  }

  async updatePanelMessage(
    guildId: string,
    panelMessageId: string
  ): Promise<NoteConfig | undefined> {
    const config = await this.prisma.noteConfig
      .update({
        where: { guildId },
        data: { panelMessageId }
      })
      .catch((error: unknown) => {
        if (isRecordNotFoundError(error)) {
          return undefined
        }

        throw error
      })

    return config ? toNoteConfig(config) : undefined
  }

  async deleteConfig(guildId: string): Promise<boolean> {
    const result = await this.prisma.noteConfig.deleteMany({
      where: { guildId }
    })

    return result.count > 0
  }

  async listCategories(guildId: string, kind: NoteCategoryKind): Promise<NoteCategory[]> {
    const categories = await this.prisma.noteCategory.findMany({
      where: {
        guildId,
        kind: toPrismaCategoryKind(kind)
      },
      orderBy: { sortOrder: 'asc' }
    })

    return categories.map(toNoteCategory)
  }

  async addCategory(input: {
    guildId: string
    categoryId: string
    kind: NoteCategoryKind
    sortOrder: number
  }): Promise<NoteCategory> {
    const category = await this.prisma.noteCategory.upsert({
      where: {
        guildId_categoryId: {
          guildId: input.guildId,
          categoryId: input.categoryId
        }
      },
      create: {
        guildId: input.guildId,
        categoryId: input.categoryId,
        kind: toPrismaCategoryKind(input.kind),
        sortOrder: input.sortOrder
      },
      update: {
        kind: toPrismaCategoryKind(input.kind),
        sortOrder: input.sortOrder
      }
    })

    return toNoteCategory(category)
  }

  async deleteCategory(guildId: string, categoryId: string): Promise<boolean> {
    const result = await this.prisma.noteCategory.deleteMany({
      where: {
        guildId,
        categoryId
      }
    })

    return result.count > 0
  }

  async getNoteByUser(guildId: string, userId: string): Promise<NoteChannel | undefined> {
    const note = await this.prisma.noteChannel.findUnique({
      where: {
        guildId_userId: {
          guildId,
          userId
        }
      }
    })

    return note ? toNoteChannel(note) : undefined
  }

  async getNoteByChannel(channelId: string): Promise<NoteChannel | undefined> {
    const note = await this.prisma.noteChannel.findUnique({
      where: { channelId }
    })

    return note ? toNoteChannel(note) : undefined
  }

  async createNote(input: NoteChannelInput): Promise<NoteChannel> {
    const note = await this.prisma.noteChannel.upsert({
      where: {
        guildId_userId: {
          guildId: input.guildId,
          userId: input.userId
        }
      },
      create: {
        guildId: input.guildId,
        userId: input.userId,
        channelId: input.channelId,
        categoryId: input.categoryId,
        status: 'ACTIVE',
        visibility: toPrismaVisibility(input.visibility),
        commentMode: toPrismaCommentMode(input.commentMode),
        archivedAt: null
      },
      update: {
        channelId: input.channelId,
        categoryId: input.categoryId,
        status: 'ACTIVE',
        visibility: toPrismaVisibility(input.visibility),
        commentMode: toPrismaCommentMode(input.commentMode),
        archivedAt: null
      }
    })

    return toNoteChannel(note)
  }

  async updateNoteState(
    guildId: string,
    userId: string,
    input: {
      categoryId?: string
      status?: NoteChannelStatus
      visibility?: NoteVisibility
      commentMode?: NoteCommentMode
      archivedAt?: string | null
    }
  ): Promise<NoteChannel | undefined> {
    const note = await this.prisma.noteChannel
      .update({
        where: {
          guildId_userId: {
            guildId,
            userId
          }
        },
        data: {
          categoryId: input.categoryId,
          status: input.status ? toPrismaChannelStatus(input.status) : undefined,
          visibility: input.visibility ? toPrismaVisibility(input.visibility) : undefined,
          commentMode: input.commentMode ? toPrismaCommentMode(input.commentMode) : undefined,
          archivedAt:
            input.archivedAt === undefined
              ? undefined
              : input.archivedAt
                ? new Date(input.archivedAt)
                : null
        }
      })
      .catch((error: unknown) => {
        if (isRecordNotFoundError(error)) {
          return undefined
        }

        throw error
      })

    return note ? toNoteChannel(note) : undefined
  }

  async deleteNoteByUser(guildId: string, userId: string): Promise<boolean> {
    const result = await this.prisma.noteChannel.deleteMany({
      where: {
        guildId,
        userId
      }
    })

    return result.count > 0
  }

  async deleteNoteByChannel(channelId: string): Promise<boolean> {
    const result = await this.prisma.noteChannel.deleteMany({
      where: { channelId }
    })

    return result.count > 0
  }

  async deleteByGuild(guildId: string): Promise<number> {
    const [configResult, categoryResult, noteResult] = await Promise.all([
      this.prisma.noteConfig.deleteMany({ where: { guildId } }),
      this.prisma.noteCategory.deleteMany({ where: { guildId } }),
      this.prisma.noteChannel.deleteMany({ where: { guildId } })
    ])

    return configResult.count + categoryResult.count + noteResult.count
  }

  async countNotes(guildId: string): Promise<{ active: number; archived: number }> {
    const [active, archived] = await Promise.all([
      this.prisma.noteChannel.count({
        where: {
          guildId,
          status: 'ACTIVE'
        }
      }),
      this.prisma.noteChannel.count({
        where: {
          guildId,
          status: 'ARCHIVED'
        }
      })
    ])

    return { active, archived }
  }
}

function toNoteConfig(config: {
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
}): NoteConfig {
  return {
    guildId: config.guildId,
    lobbyChannelId: config.lobbyChannelId,
    panelMessageId: config.panelMessageId ?? undefined,
    categoryBaseName: config.categoryBaseName,
    archiveCategoryBaseName: config.archiveCategoryBaseName,
    channelNamePrefix: config.channelNamePrefix,
    creatorRoleId: config.creatorRoleId ?? undefined,
    managerRoleId: config.managerRoleId ?? undefined,
    createdAt: config.createdAt.toISOString(),
    updatedAt: config.updatedAt.toISOString()
  }
}

function toNoteCategory(category: {
  id: number
  guildId: string
  categoryId: string
  kind: string
  sortOrder: number
  createdAt: Date
  updatedAt: Date
}): NoteCategory {
  return {
    id: category.id,
    guildId: category.guildId,
    categoryId: category.categoryId,
    kind: category.kind === 'ARCHIVE' ? 'archive' : 'active',
    sortOrder: category.sortOrder,
    createdAt: category.createdAt.toISOString(),
    updatedAt: category.updatedAt.toISOString()
  }
}

function toNoteChannel(note: {
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
}): NoteChannel {
  return {
    id: note.id,
    guildId: note.guildId,
    userId: note.userId,
    channelId: note.channelId,
    categoryId: note.categoryId,
    status: note.status === 'ARCHIVED' ? 'archived' : 'active',
    visibility: note.visibility === 'PRIVATE' ? 'private' : 'public',
    commentMode: note.commentMode === 'LOCKED' ? 'locked' : 'open',
    archivedAt: note.archivedAt?.toISOString(),
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString()
  }
}

function toPrismaCategoryKind(kind: NoteCategoryKind): 'ACTIVE' | 'ARCHIVE' {
  return kind === 'archive' ? 'ARCHIVE' : 'ACTIVE'
}

function toPrismaChannelStatus(status: NoteChannelStatus): 'ACTIVE' | 'ARCHIVED' {
  return status === 'archived' ? 'ARCHIVED' : 'ACTIVE'
}

function toPrismaVisibility(visibility: NoteVisibility): 'PUBLIC' | 'PRIVATE' {
  return visibility === 'private' ? 'PRIVATE' : 'PUBLIC'
}

function toPrismaCommentMode(commentMode: NoteCommentMode): 'OPEN' | 'LOCKED' {
  return commentMode === 'locked' ? 'LOCKED' : 'OPEN'
}

function isRecordNotFoundError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2025'
  )
}
