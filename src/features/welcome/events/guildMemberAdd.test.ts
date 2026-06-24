import { describe, expect, it, vi } from 'vitest'
import { AutoModJoinBlocklist } from '../../automod/services/autoModJoinBlocklist'
import type { WelcomeService } from '../services/welcomeService'
import { handleGuildMemberAdd } from './guildMemberAdd'

describe('welcome guildMemberAdd event', () => {
  it('does not send welcome when AutoMod blocked the joined member', async () => {
    const welcomeService = {
      send: vi.fn()
    }
    const joinBlocklist = new AutoModJoinBlocklist()
    joinBlocklist.markBlocked('guild-1', 'user-1')

    await handleGuildMemberAdd(
      {
        id: 'user-1',
        guild: { id: 'guild-1' }
      } as never,
      {
        welcomeService: welcomeService as unknown as WelcomeService,
        joinBlocklist
      }
    )

    expect(welcomeService.send).not.toHaveBeenCalled()
  })
})
