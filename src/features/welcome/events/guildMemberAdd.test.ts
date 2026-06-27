import { describe, expect, it, vi } from 'vitest'
import type { WelcomeService } from '../services/welcomeService'
import { handleGuildMemberAdd } from './guildMemberAdd'

describe('welcome guildMemberAdd event', () => {
  it('sends welcome for joined members independently of other features', async () => {
    const welcomeService = {
      send: vi.fn().mockResolvedValue(true)
    }
    const member = {
      id: 'user-1',
      guild: { id: 'guild-1' }
    }

    await handleGuildMemberAdd(
      member as never,
      {
        welcomeService: welcomeService as unknown as WelcomeService
      }
    )

    expect(welcomeService.send).toHaveBeenCalledWith(member)
  })
})
