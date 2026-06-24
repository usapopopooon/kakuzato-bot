import { Events } from 'discord.js'
import type {
  AnyDiscordEventHandler,
  DiscordEventHandler
} from '../../../platform/discord/botModule'
import type { VoiceNotifyService } from '../services/voiceNotifyService'

export function createVoiceNotifyEvents(service: VoiceNotifyService): AnyDiscordEventHandler[] {
  return [
    createVoiceStateUpdateEvent(service),
    createChannelDeleteEvent(service),
    createGuildDeleteEvent(service)
  ]
}

function createVoiceStateUpdateEvent(
  service: VoiceNotifyService
): DiscordEventHandler<typeof Events.VoiceStateUpdate> {
  return {
    name: Events.VoiceStateUpdate,
    execute: async (before, after) => {
      await service.handleVoiceStateUpdate(before, after)
    }
  }
}

function createChannelDeleteEvent(
  service: VoiceNotifyService
): DiscordEventHandler<typeof Events.ChannelDelete> {
  return {
    name: Events.ChannelDelete,
    execute: async (channel) => {
      const guildId = 'guild' in channel ? channel.guild.id : undefined

      if (guildId) {
        await service.deleteByChannel(guildId, channel.id)
      }
    }
  }
}

function createGuildDeleteEvent(
  service: VoiceNotifyService
): DiscordEventHandler<typeof Events.GuildDelete> {
  return {
    name: Events.GuildDelete,
    execute: async (guild) => {
      await service.deleteByGuild(guild.id)
    }
  }
}
