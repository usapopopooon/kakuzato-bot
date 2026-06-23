import type { AppConfig } from "../../platform/config/env";
import type { BotModule } from "../../platform/discord/botModule";
import type { AppLogger } from "../../platform/logger/logger";
import { createGuildMemberAddEvent } from "./events/guildMemberAdd";
import { JoinBannerService } from "./services/joinBannerService";

type WelcomeModuleDeps = {
  config: AppConfig;
  logger: AppLogger;
};

export function createWelcomeModule({ config, logger }: WelcomeModuleDeps): BotModule {
  const bannerService = new JoinBannerService({
    templatePath: config.joinBannerTemplatePath,
    logger
  });

  return {
    name: "welcome",
    events: [
      createGuildMemberAddEvent({
        config,
        bannerService,
        logger
      })
    ]
  };
}
