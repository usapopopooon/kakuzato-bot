import { Events } from 'discord.js'
import type {
  AnyDiscordEventHandler,
  DiscordEventHandler
} from '../../../platform/discord/botModule'
import type { PostRoleService } from '../services/postRoleService'

export function createPostRoleEvents(service: PostRoleService): AnyDiscordEventHandler[] {
  return [
    createClientReadyEvent(service),
    createMessageCreateEvent(service),
    createChannelDeleteEvent(service),
    createRoleDeleteEvent(service),
    createGuildDeleteEvent(service)
  ]
}

function createClientReadyEvent(
  service: PostRoleService
): DiscordEventHandler<typeof Events.ClientReady> {
  return {
    name: Events.ClientReady,
    once: true,
    execute: async (client) => {
      await service.syncAll(client)
    }
  }
}

function createMessageCreateEvent(
  service: PostRoleService
): DiscordEventHandler<typeof Events.MessageCreate> {
  return {
    name: Events.MessageCreate,
    execute: async (message) => {
      await service.handleMessage(message)
    }
  }
}

function createChannelDeleteEvent(
  service: PostRoleService
): DiscordEventHandler<typeof Events.ChannelDelete> {
  return {
    name: Events.ChannelDelete,
    execute: async (channel) => {
      await service.remove(channel.id)
    }
  }
}

function createGuildDeleteEvent(
  service: PostRoleService
): DiscordEventHandler<typeof Events.GuildDelete> {
  return {
    name: Events.GuildDelete,
    execute: async (guild) => {
      await service.deleteByGuild(guild.id)
    }
  }
}

function createRoleDeleteEvent(
  service: PostRoleService
): DiscordEventHandler<typeof Events.GuildRoleDelete> {
  return {
    name: Events.GuildRoleDelete,
    execute: async (role) => {
      await service.deleteByRole(role.guild.id, role.id)
    }
  }
}
