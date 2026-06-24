import { Events, type GuildMember } from 'discord.js'
import type { DiscordEventHandler } from '../../../platform/discord/botModule'
import type { AutoModJoinBlocklist } from '../../automod/services/autoModJoinBlocklist'
import type { WelcomeService } from '../services/welcomeService'

type GuildMemberAddDeps = {
  welcomeService: WelcomeService
  joinBlocklist?: AutoModJoinBlocklist
}

export function createGuildMemberAddEvent(
  deps: GuildMemberAddDeps
): DiscordEventHandler<typeof Events.GuildMemberAdd> {
  return {
    name: Events.GuildMemberAdd,
    execute: (member) => handleGuildMemberAdd(member, deps)
  }
}

export async function handleGuildMemberAdd(
  member: GuildMember,
  deps: GuildMemberAddDeps
): Promise<void> {
  if (deps.joinBlocklist?.isBlocked(member.guild.id, member.id)) {
    return
  }

  await deps.welcomeService.send(member)
}
