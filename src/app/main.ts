import { Events } from 'discord.js'
import { loadConfig } from '../platform/config/env'
import { connectDatabase, createPrismaClient } from '../platform/database/prisma'
import { createDiscordClient } from '../platform/discord/client'
import {
  collectComponentHandlers,
  collectCommands,
  collectModalSubmitHandlers,
  registerInteractionRouter,
  syncCommandsForGuild,
  syncGuildCommands
} from '../platform/discord/registerCommands'
import { registerBotModules } from '../platform/discord/registerBotModules'
import { createLogger } from '../platform/logger/logger'
import { createAutoModModule } from '../features/automod/autoMod.module'
import { AutoModJoinBlocklist } from '../features/automod/services/autoModJoinBlocklist'
import { createBotActivityModule } from '../features/bot-activity/botActivity.module'
import { createEventLogModule } from '../features/event-log/eventLog.module'
import { createStickyModule } from '../features/sticky/sticky.module'
import { createWelcomeModule } from '../features/welcome/welcome.module'
import { markHealthy } from './health'
import { setupShutdown } from './shutdown'
import { createBumpModule } from '../features/bump/bump.module'

async function main(): Promise<void> {
  const config = loadConfig()
  const logger = createLogger(config.logLevel)
  const prisma = createPrismaClient(config.databaseUrl)
  await connectDatabase(prisma, logger)
  const client = createDiscordClient()
  const autoModJoinBlocklist = new AutoModJoinBlocklist()

  const modules = [
    createBotActivityModule({ logger, prisma }),
    createAutoModModule({ logger, prisma, joinBlocklist: autoModJoinBlocklist }),
    createBumpModule({ logger, prisma }),
    createWelcomeModule({ logger, prisma, joinBlocklist: autoModJoinBlocklist }),
    createStickyModule({ logger, prisma }),
    createEventLogModule({ logger, prisma })
  ]
  const commands = collectCommands(modules)
  const componentHandlers = collectComponentHandlers(modules)
  const modalSubmitHandlers = collectModalSubmitHandlers(modules)

  registerBotModules(client, modules, logger)
  registerInteractionRouter(client, commands, logger, {
    componentHandlers,
    modalSubmitHandlers
  })

  client.once(Events.ClientReady, async (readyClient) => {
    await syncGuildCommands(readyClient, commands, logger)
    logger.info({ user: readyClient.user.tag }, 'Discord bot is ready')
    await markHealthy(config.healthcheckFile)
  })

  client.on(Events.GuildCreate, async (guild) => {
    await syncCommandsForGuild(guild, commands, logger)
  })

  setupShutdown({ client, prisma, healthcheckFile: config.healthcheckFile, logger })

  await client.login(config.discordToken)
}

main().catch((error) => {
  const logger = createLogger('fatal')
  logger.fatal({ error }, 'Failed to start Discord bot')
  process.exit(1)
})
