import { MessageFlags, PermissionFlagsBits, type ChatInputCommandInteraction } from 'discord.js'
import { describe, expect, it, vi } from 'vitest'
import type { BumpService } from '../services/bumpService'
import { createBumpCommand } from './bumpCommand'

describe('bump command', () => {
  it('rejects non-admin users before changing notification settings', async () => {
    const service = {
      setReminderEnabled: vi.fn()
    }
    const reply = vi.fn()
    const command = createBumpCommand(service as unknown as BumpService)

    await command.execute({
      inCachedGuild: () => true,
      memberPermissions: { has: () => false },
      reply
    } as unknown as ChatInputCommandInteraction)

    expect(service.setReminderEnabled).not.toHaveBeenCalled()
    expect(reply).toHaveBeenCalledWith({
      content: 'このコマンドは管理者のみ実行できます。',
      flags: MessageFlags.Ephemeral
    })
  })

  it('sets bump notifications from the notify subcommand', async () => {
    const service = {
      setReminderEnabled: vi.fn().mockResolvedValue({
        isEnabled: false
      })
    }
    const reply = vi.fn()
    const command = createBumpCommand(service as unknown as BumpService)

    await command.execute(
      createInteraction({
        subcommand: 'notify',
        options: {
          service: 'DISBOARD',
          enabled: false
        },
        reply
      })
    )

    expect(service.setReminderEnabled).toHaveBeenCalledWith('guild-1', 'DISBOARD', false)
    expect(reply).toHaveBeenCalledWith({
      content: '**DISBOARD** の通知を **無効** にしました。',
      flags: MessageFlags.Ephemeral
    })
  })

  it('sets the bump notification role from the role subcommand', async () => {
    const service = {
      setReminderRole: vi.fn().mockResolvedValue({
        roleId: 'role-1'
      })
    }
    const reply = vi.fn()
    const command = createBumpCommand(service as unknown as BumpService)

    await command.execute(
      createInteraction({
        subcommand: 'role',
        options: {
          service: 'DISSOKU',
          role: { id: 'role-1' }
        },
        reply
      })
    )

    expect(service.setReminderRole).toHaveBeenCalledWith('guild-1', 'DISSOKU', 'role-1')
    expect(reply).toHaveBeenCalledWith({
      content: '**ディス速報** の通知先を <@&role-1> に変更しました。',
      flags: MessageFlags.Ephemeral
    })
  })

  it('resets the bump notification role from the role-reset subcommand', async () => {
    const service = {
      setReminderRole: vi.fn().mockResolvedValue({
        roleId: undefined
      })
    }
    const reply = vi.fn()
    const command = createBumpCommand(service as unknown as BumpService)

    await command.execute(
      createInteraction({
        subcommand: 'role-reset',
        options: {
          service: 'DISBOARD'
        },
        reply
      })
    )

    expect(service.setReminderRole).toHaveBeenCalledWith('guild-1', 'DISBOARD', undefined)
    expect(reply).toHaveBeenCalledWith({
      content: '**DISBOARD** の通知先を メンションなし (デフォルト) に戻しました。',
      flags: MessageFlags.Ephemeral
    })
  })
})

function createInteraction(input: {
  subcommand: string
  options: {
    service?: string
    enabled?: boolean
    role?: { id: string }
  }
  reply: ReturnType<typeof vi.fn>
}): ChatInputCommandInteraction {
  return {
    inCachedGuild: () => true,
    guildId: 'guild-1',
    guild: {
      roles: {
        cache: {
          get: vi.fn()
        }
      }
    },
    memberPermissions: {
      has: (permission: bigint) => permission === PermissionFlagsBits.Administrator
    },
    options: {
      getSubcommand: () => input.subcommand,
      getString: () => input.options.service,
      getBoolean: () => input.options.enabled,
      getRole: () => input.options.role
    },
    reply: input.reply
  } as unknown as ChatInputCommandInteraction
}
