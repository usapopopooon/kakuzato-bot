import { describe, expect, it, vi } from 'vitest'
import {
  defaultWelcomeBannerMessageTemplate,
  defaultWelcomeMessageContent,
  WelcomeConfigRepository
} from './welcomeConfigRepository'

type WelcomeRow = {
  guildId: string
  channelId: string
  enabled: boolean
  messageContent: string
  bannerMessageTemplate: string
  updatedAt: Date
}

function createRepository() {
  const rows = new Map<string, WelcomeRow>()
  const welcomeConfig = {
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
        create: Omit<WelcomeRow, 'updatedAt'>
        update: Partial<Omit<WelcomeRow, 'guildId' | 'updatedAt'>>
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
        data: Partial<Omit<WelcomeRow, 'guildId' | 'updatedAt'>>
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
    repository: new WelcomeConfigRepository({ welcomeConfig } as never),
    rows
  }
}

describe('WelcomeConfigRepository', () => {
  it('stores an enabled channel config per guild', async () => {
    const { repository } = createRepository()

    const config = await repository.setChannel('guild-1', 'channel-1')

    expect(config).toMatchObject({
      guildId: 'guild-1',
      channelId: 'channel-1',
      enabled: true,
      messageContent: defaultWelcomeMessageContent,
      bannerMessageTemplate: defaultWelcomeBannerMessageTemplate
    })
    await expect(repository.get('guild-1')).resolves.toMatchObject({
      channelId: 'channel-1',
      enabled: true,
      messageContent: defaultWelcomeMessageContent,
      bannerMessageTemplate: defaultWelcomeBannerMessageTemplate
    })
  })

  it('updates the message while preserving the channel config', async () => {
    const { repository } = createRepository()
    await repository.setChannel('guild-1', 'channel-1')

    await expect(repository.setMessage('guild-1', 'ようこそ、{mention}!')).resolves.toMatchObject({
      channelId: 'channel-1',
      enabled: true,
      messageContent: 'ようこそ、{mention}!'
    })
  })

  it('updates the banner message while preserving the channel config', async () => {
    const { repository } = createRepository()
    await repository.setChannel('guild-1', 'channel-1')

    await expect(
      repository.setBannerMessage('guild-1', '{displayName} さんが召喚されました！')
    ).resolves.toMatchObject({
      channelId: 'channel-1',
      enabled: true,
      bannerMessageTemplate: '{displayName} さんが召喚されました！'
    })
  })

  it('returns undefined when updating a missing config', async () => {
    const { repository } = createRepository()

    await expect(repository.setMessage('guild-1', 'hello')).resolves.toBeUndefined()
    await expect(repository.setBannerMessage('guild-1', 'hello')).resolves.toBeUndefined()
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
