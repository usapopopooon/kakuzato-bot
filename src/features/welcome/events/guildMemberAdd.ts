import { Events, type GuildMember } from 'discord.js'
import type { DiscordEventHandler } from '../../../platform/discord/botModule'
import type { WelcomeService } from '../services/welcomeService'

type GuildMemberAddDeps = {
  welcomeService: WelcomeService
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
  await deps.welcomeService.send(member)
}
