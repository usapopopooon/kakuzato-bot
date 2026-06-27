import { Events } from 'discord.js'
import type {
  AnyDiscordEventHandler,
  DiscordEventHandler
} from '../../../platform/discord/botModule'
import type { NoteService } from '../services/noteService'

export function createNoteEvents(service: NoteService): AnyDiscordEventHandler[] {
  return [
    createGuildMemberRemoveEvent(service),
    createChannelDeleteEvent(service),
    createGuildDeleteEvent(service)
  ]
}

function createGuildMemberRemoveEvent(
  service: NoteService
): DiscordEventHandler<typeof Events.GuildMemberRemove> {
  return {
    name: Events.GuildMemberRemove,
    execute: async (member) => {
      await service.archiveMemberNote(member)
    }
  }
}

function createChannelDeleteEvent(
  service: NoteService
): DiscordEventHandler<typeof Events.ChannelDelete> {
  return {
    name: Events.ChannelDelete,
    execute: async (channel) => {
      await service.deleteChannelRecord(channel)
    }
  }
}

function createGuildDeleteEvent(
  service: NoteService
): DiscordEventHandler<typeof Events.GuildDelete> {
  return {
    name: Events.GuildDelete,
    execute: async (guild) => {
      await service.deleteByGuild(guild.id)
    }
  }
}
