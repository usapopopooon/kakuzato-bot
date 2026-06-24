import { Events } from 'discord.js'
import type {
  AnyDiscordEventHandler,
  DiscordEventHandler
} from '../../../platform/discord/botModule'
import type { StickyMessageService } from '../services/stickyMessageService'

export function createStickyMessageEvents(service: StickyMessageService): AnyDiscordEventHandler[] {
  return [
    createClientReadyEvent(service),
    createMessageCreateEvent(service),
    createChannelDeleteEvent(service),
    createGuildDeleteEvent(service)
  ]
}

function createClientReadyEvent(
  service: StickyMessageService
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
  service: StickyMessageService
): DiscordEventHandler<typeof Events.MessageCreate> {
  return {
    name: Events.MessageCreate,
    execute: async (message) => {
      await service.handleMessage(message)
    }
  }
}

function createChannelDeleteEvent(
  service: StickyMessageService
): DiscordEventHandler<typeof Events.ChannelDelete> {
  return {
    name: Events.ChannelDelete,
    execute: async (channel) => {
      await service.deleteChannel(channel.id)
    }
  }
}

function createGuildDeleteEvent(
  service: StickyMessageService
): DiscordEventHandler<typeof Events.GuildDelete> {
  return {
    name: Events.GuildDelete,
    execute: async (guild) => {
      await service.deleteByGuild(guild.id)
    }
  }
}
