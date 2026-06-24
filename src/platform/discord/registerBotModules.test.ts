import { Events, type Client } from 'discord.js'
import { describe, expect, it, vi } from 'vitest'
import type { BotModule } from './botModule'
import { registerBotModules } from './registerBotModules'

describe('registerBotModules', () => {
  it('runs handlers for the same event sequentially in module order', async () => {
    const listeners = new Map<string, (...args: unknown[]) => Promise<void>>()
    const on = vi.fn((eventName: string, listener: (...args: unknown[]) => Promise<void>) => {
      listeners.set(eventName, listener)
    })
    const client = {
      on,
      once: vi.fn()
    } as unknown as Client
    const calls: string[] = []
    const modules: BotModule[] = [
      {
        name: 'first',
        events: [
          {
            name: Events.GuildMemberAdd,
            execute: async () => {
              await Promise.resolve()
              calls.push('first')
            }
          }
        ]
      },
      {
        name: 'second',
        events: [
          {
            name: Events.GuildMemberAdd,
            execute: () => {
              calls.push('second')
            }
          }
        ]
      }
    ]

    registerBotModules(client, modules, createLogger())
    await listeners.get(Events.GuildMemberAdd)?.({})

    expect(calls).toEqual(['first', 'second'])
    expect(on).toHaveBeenCalledTimes(1)
  })
})

function createLogger() {
  return {
    error: vi.fn()
  } as never
}
