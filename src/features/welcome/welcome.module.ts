import type { BotModule } from "../../platform/discord/botModule";
import type { AppLogger } from "../../platform/logger/logger";
import type { AppPrismaClient } from "../../platform/database/prisma";
import { createWelcomeCommand } from "./commands/welcomeCommand";
import { createGuildMemberAddEvent } from "./events/guildMemberAdd";
import { WelcomeConfigRepository } from "./repositories/welcomeConfigRepository";
import { JoinBannerService } from "./services/joinBannerService";
import { WelcomeService } from "./services/welcomeService";

const joinBannerTemplatePath = "static/img/join-banner-template.png";

type WelcomeModuleDeps = {
  logger: AppLogger;
  prisma: AppPrismaClient;
};

export function createWelcomeModule({ logger, prisma }: WelcomeModuleDeps): BotModule {
  const repository = new WelcomeConfigRepository(prisma);
  const bannerService = new JoinBannerService({
    templatePath: joinBannerTemplatePath,
    logger
  });
  const welcomeService = new WelcomeService(repository, bannerService, logger);

  return {
    name: "welcome",
    commands: [createWelcomeCommand(welcomeService)],
    events: [
      createGuildMemberAddEvent({
        welcomeService
      })
    ]
  };
}
