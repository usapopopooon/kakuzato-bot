import type { Client } from 'discord.js'
import type { AppLogger } from '../logger/logger'
import type { AnyDiscordEventHandler, BotModule } from './botModule'

type RegisteredEventHandler = {
  moduleName: string
  event: AnyDiscordEventHandler
}

export function registerBotModules(client: Client, modules: BotModule[], logger: AppLogger): void {
  const groupedEvents = new Map<string, RegisteredEventHandler[]>()

  for (const botModule of modules) {
    for (const event of botModule.events ?? []) {
      const key = `${String(event.name)}:${event.once ? 'once' : 'on'}`
      const handlers = groupedEvents.get(key) ?? []
      handlers.push({ moduleName: botModule.name, event })
      groupedEvents.set(key, handlers)
    }
  }

  for (const handlers of groupedEvents.values()) {
    registerEventGroup(client, handlers, logger)
  }
}

function registerEventGroup(
  client: Client,
  handlers: RegisteredEventHandler[],
  logger: AppLogger
): void {
  const event = handlers[0]?.event

  if (!event) {
    return
  }

  const listener = async (...args: unknown[]) => {
    for (const handler of handlers) {
      try {
        await handler.event.execute(...(args as never[]))
      } catch (error) {
        logger.error(
          { error, event: handler.event.name, module: handler.moduleName },
          'Discord event handler failed'
        )
      }
    }
  }

  if (event.once) {
    client.once(event.name, listener)
    return
  }

  client.on(event.name, listener)
}
