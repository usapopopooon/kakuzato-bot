import { Events } from 'discord.js'
import type {
  AnyDiscordEventHandler,
  DiscordEventHandler
} from '../../../platform/discord/botModule'
import type { AutoReactionService } from '../services/autoReactionService'

export function createAutoReactionEvents(service: AutoReactionService): AnyDiscordEventHandler[] {
  return [
    createClientReadyEvent(service),
    createMessageCreateEvent(service),
    createChannelDeleteEvent(service),
    createGuildDeleteEvent(service)
  ]
}

function createClientReadyEvent(
  service: AutoReactionService
): DiscordEventHandler<typeof Events.ClientReady> {
  return {
    name: Events.ClientReady,
    once: true,
    execute: async () => {
      await service.loadConfiguredChannels()
    }
  }
}

function createMessageCreateEvent(
  service: AutoReactionService
): DiscordEventHandler<typeof Events.MessageCreate> {
  return {
    name: Events.MessageCreate,
    execute: async (message) => {
      await service.handleMessage(message)
    }
  }
}

function createChannelDeleteEvent(
  service: AutoReactionService
): DiscordEventHandler<typeof Events.ChannelDelete> {
  return {
    name: Events.ChannelDelete,
    execute: async (channel) => {
      await service.remove(channel.id)
    }
  }
}

function createGuildDeleteEvent(
  service: AutoReactionService
): DiscordEventHandler<typeof Events.GuildDelete> {
  return {
    name: Events.GuildDelete,
    execute: async (guild) => {
      await service.deleteByGuild(guild.id)
    }
  }
}
