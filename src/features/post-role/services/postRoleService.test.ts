import { ChannelType, Collection, type Guild, type Message } from 'discord.js'
import { describe, expect, it, vi } from 'vitest'
import type { PostRoleConfig, PostRoleRepository } from '../repositories/postRoleRepository'
import {
  defaultPostRoleHistoryLimit,
  formatPostRoleSyncResult,
  maxPostRoleHistoryLimit,
  minPostRoleHistoryLimit,
  normalizePostRoleHistoryLimit,
  PostRoleService
} from './postRoleService'

describe('post role service helpers', () => {
  it('normalizes history scan limits', () => {
    expect(normalizePostRoleHistoryLimit(undefined)).toBe(defaultPostRoleHistoryLimit)
    expect(normalizePostRoleHistoryLimit(0)).toBe(minPostRoleHistoryLimit)
    expect(normalizePostRoleHistoryLimit(maxPostRoleHistoryLimit + 1)).toBe(
      maxPostRoleHistoryLimit
    )
    expect(normalizePostRoleHistoryLimit(123.9)).toBe(123)
  })

  it('formats sync results for command output', () => {
    expect(
      formatPostRoleSyncResult({
        configs: 1,
        scannedMessages: 10,
        uniqueUsers: 2,
        assigned: 1,
        alreadyHad: 1,
        skippedBots: 3,
        skippedMissingMembers: 0,
        failed: 0
      })
    ).toContain('付与: 1人')
  })
})

describe('PostRoleService', () => {
  it('grants the configured role when a member posts in the watched channel', async () => {
    const config = createConfig()
    const roleAdd = vi.fn().mockResolvedValue(undefined)
    const repository = {
      get: vi.fn().mockResolvedValue(config)
    } as unknown as PostRoleRepository
    const service = new PostRoleService(repository, createLoggerMock())
    const guild = createGuild({
      members: {
        fetch: vi.fn().mockResolvedValue(createMember(false, roleAdd))
      }
    })
    const message = {
      guild,
      channel: { id: config.channelId },
      author: { id: 'user-1', bot: false }
    } as unknown as Message

    await service.handleMessage(message)

    expect(roleAdd).toHaveBeenCalledWith(config.roleId, 'Post role assignment')
  })

  it('syncs recent history and grants once per unique non-bot member', async () => {
    const config = createConfig({ historyLimit: 100 })
    const roleAdd = vi.fn().mockResolvedValue(undefined)
    const messages = new Collection<string, Message<true>>([
      ['message-3', createMessage('message-3', 'bot-1', true)],
      ['message-2', createMessage('message-2', 'user-1')],
      ['message-1', createMessage('message-1', 'user-1')]
    ])
    const channel = {
      id: config.channelId,
      type: ChannelType.GuildText,
      messages: {
        fetch: vi.fn().mockResolvedValue(messages)
      }
    }
    const repository = {
      listByGuild: vi.fn().mockResolvedValue([config])
    } as unknown as PostRoleRepository
    const service = new PostRoleService(repository, createLoggerMock())
    const guild = createGuild({
      channels: {
        fetch: vi.fn().mockResolvedValue(channel)
      },
      members: {
        fetch: vi.fn().mockResolvedValue(createMember(false, roleAdd))
      }
    })

    await expect(service.syncGuild(guild)).resolves.toMatchObject({
      configs: 1,
      scannedMessages: 3,
      uniqueUsers: 1,
      assigned: 1,
      skippedBots: 1
    })
    expect(roleAdd).toHaveBeenCalledTimes(1)
  })

  it('keeps role assignment idempotent when the member already has the role', async () => {
    const config = createConfig()
    const roleAdd = vi.fn()
    const repository = {
      get: vi.fn().mockResolvedValue(config)
    } as unknown as PostRoleRepository
    const service = new PostRoleService(repository, createLoggerMock())
    const guild = createGuild({
      members: {
        fetch: vi.fn().mockResolvedValue(createMember(true, roleAdd))
      }
    })
    const message = {
      guild,
      channel: { id: config.channelId },
      author: { id: 'user-1', bot: false }
    } as unknown as Message

    await service.handleMessage(message)

    expect(roleAdd).not.toHaveBeenCalled()
  })

  it('logs the cause when role assignment fails', async () => {
    const config = createConfig()
    const error = new Error('missing permissions')
    const roleAdd = vi.fn().mockRejectedValue(error)
    const repository = {
      get: vi.fn().mockResolvedValue(config)
    } as unknown as PostRoleRepository
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn()
    }
    const service = new PostRoleService(repository, logger as never)
    const guild = createGuild({
      members: {
        fetch: vi.fn().mockResolvedValue(createMember(false, roleAdd))
      }
    })
    const message = {
      guild,
      channel: { id: config.channelId },
      author: { id: 'user-1', bot: false }
    } as unknown as Message

    await service.handleMessage(message)

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        error,
        guildId: 'guild-1',
        userId: 'user-1',
        roleId: config.roleId
      }),
      'Failed to grant post role'
    )
  })

  it('deletes configs by removed role', async () => {
    const deleteByRole = vi.fn().mockResolvedValue(1)
    const repository = {
      listByGuild: vi.fn().mockResolvedValue([createConfig()]),
      deleteByRole
    } as unknown as PostRoleRepository
    const service = new PostRoleService(repository, createLoggerMock())

    await expect(service.deleteByRole('guild-1', 'role-1')).resolves.toBe(1)

    expect(deleteByRole).toHaveBeenCalledWith('guild-1', 'role-1')
  })
})

function createConfig(input: Partial<PostRoleConfig> = {}): PostRoleConfig {
  return {
    guildId: 'guild-1',
    channelId: 'channel-1',
    roleId: 'role-1',
    historyLimit: 500,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...input
  }
}

function createGuild(overrides: Record<string, unknown>): Guild {
  return {
    id: 'guild-1',
    channels: {
      fetch: vi.fn()
    },
    members: {
      fetch: vi.fn()
    },
    ...overrides
  } as unknown as Guild
}

function createMember(hasRole: boolean, roleAdd: ReturnType<typeof vi.fn>) {
  return {
    user: { bot: false },
    roles: {
      cache: {
        has: vi.fn().mockReturnValue(hasRole)
      },
      add: roleAdd
    }
  }
}

function createMessage(id: string, userId: string, bot = false): Message<true> {
  return {
    id,
    author: {
      id: userId,
      bot
    }
  } as unknown as Message<true>
}

function createLoggerMock() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  } as never
}
