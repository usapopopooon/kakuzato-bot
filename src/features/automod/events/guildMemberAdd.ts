import { Events, type GuildMember } from 'discord.js'
import type { DiscordEventHandler } from '../../../platform/discord/botModule'
import type { AutoModService } from '../services/autoModService'

type GuildMemberAddDeps = {
  autoModService: AutoModService
}

export function createAutoModGuildMemberAddEvent(
  deps: GuildMemberAddDeps
): DiscordEventHandler<typeof Events.GuildMemberAdd> {
  return {
    name: Events.GuildMemberAdd,
    execute: (member) => handleAutoModGuildMemberAdd(member, deps)
  }
}

export async function handleAutoModGuildMemberAdd(
  member: GuildMember,
  deps: GuildMemberAddDeps
): Promise<void> {
  await deps.autoModService.handleMemberJoin(member)
}
