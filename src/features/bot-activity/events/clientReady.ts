import { Events } from "discord.js";
import type { DiscordEventHandler } from "../../../platform/discord/botModule";
import type { BotActivityService } from "../services/botActivityService";

export function createClientReadyEvent(
  service: BotActivityService
): DiscordEventHandler<typeof Events.ClientReady> {
  return {
    name: Events.ClientReady,
    once: true,
    execute: async (client) => {
      await service.applyToClient(client);
    }
  };
}
