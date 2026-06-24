import type { Client } from 'discord.js'
import type { AppLogger } from '../logger/logger'
import type { AnyDiscordEventHandler, BotModule } from './botModule'

export function registerBotModules(client: Client, modules: BotModule[], logger: AppLogger): void {
  for (const botModule of modules) {
    for (const event of botModule.events ?? []) {
      registerEvent(client, botModule.name, event, logger)
    }
  }
}

function registerEvent(
  client: Client,
  moduleName: string,
  event: AnyDiscordEventHandler,
  logger: AppLogger
): void {
  const listener = async (...args: unknown[]) => {
    try {
      await event.execute(...(args as never[]))
    } catch (error) {
      logger.error({ error, event: event.name, module: moduleName }, 'Discord event handler failed')
    }
  }

  if (event.once) {
    client.once(event.name, listener)
    return
  }

  client.on(event.name, listener)
}
