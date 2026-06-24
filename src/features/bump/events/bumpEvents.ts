import { Events } from 'discord.js'
import type {
  AnyDiscordEventHandler,
  DiscordEventHandler
} from '../../../platform/discord/botModule'
import type { BumpService } from '../services/bumpService'

export function createBumpEvents(service: BumpService): AnyDiscordEventHandler[] {
  return [
    createClientReadyEvent(service),
    createMessageCreateEvent(service),
    createMessageUpdateEvent(service),
    createChannelDeleteEvent(service),
    createGuildDeleteEvent(service)
  ]
}

function createClientReadyEvent(
  service: BumpService
): DiscordEventHandler<typeof Events.ClientReady> {
  return {
    name: Events.ClientReady,
    once: true,
    execute: async (client) => {
      await service.loadConfiguredGuilds()
      service.startReminderLoop(client)
    }
  }
}

function createMessageCreateEvent(
  service: BumpService
): DiscordEventHandler<typeof Events.MessageCreate> {
  return {
    name: Events.MessageCreate,
    execute: async (message) => {
      await service.handleMessage(message)
    }
  }
}

function createMessageUpdateEvent(
  service: BumpService
): DiscordEventHandler<typeof Events.MessageUpdate> {
  return {
    name: Events.MessageUpdate,
    execute: async (before, after) => {
      if (before.embeds.length === 0 && after.embeds.length > 0 && !after.partial) {
        await service.handleMessage(after)
      }
    }
  }
}

function createChannelDeleteEvent(
  service: BumpService
): DiscordEventHandler<typeof Events.ChannelDelete> {
  return {
    name: Events.ChannelDelete,
    execute: async (channel) => {
      const guildId = 'guild' in channel ? channel.guild.id : undefined

      if (guildId) {
        await service.deleteChannel(guildId, channel.id)
      }
    }
  }
}

function createGuildDeleteEvent(
  service: BumpService
): DiscordEventHandler<typeof Events.GuildDelete> {
  return {
    name: Events.GuildDelete,
    execute: async (guild) => {
      await service.deleteByGuild(guild.id)
    }
  }
}
