import { AttachmentBuilder, type Guild, type GuildMember } from "discord.js";
import type { AppLogger } from "../../../platform/logger/logger";
import type {
  WelcomeConfig,
  WelcomeConfigRepository
} from "../repositories/welcomeConfigRepository";
import { renderWelcomeMessage } from "./welcomeMessage";
import type { JoinBannerService } from "./joinBannerService";

export type WelcomeSendableChannel = {
  id: string;
  send(options: {
    content: string;
    files: AttachmentBuilder[];
    allowedMentions: { users: string[] };
  }): Promise<unknown>;
};

export class WelcomeService {
  private readonly repository: WelcomeConfigRepository;
  private readonly bannerService: JoinBannerService;
  private readonly logger: AppLogger;

  constructor(
    repository: WelcomeConfigRepository,
    bannerService: JoinBannerService,
    logger: AppLogger
  ) {
    this.repository = repository;
    this.bannerService = bannerService;
    this.logger = logger;
  }

  async getConfig(guildId: string): Promise<WelcomeConfig | undefined> {
    return this.repository.get(guildId);
  }

  async setChannel(guildId: string, channelId: string): Promise<WelcomeConfig> {
    return this.repository.setChannel(guildId, channelId);
  }

  async setMessage(guildId: string, messageContent: string): Promise<WelcomeConfig | undefined> {
    return this.repository.setMessage(guildId, messageContent);
  }

  async disable(guildId: string): Promise<WelcomeConfig | undefined> {
    return this.repository.disable(guildId);
  }

  async send(member: GuildMember): Promise<boolean> {
    const config = await this.repository.get(member.guild.id);

    if (!config?.enabled) {
      return false;
    }

    const channel = await this.fetchSendableChannel(member.guild, config.channelId);

    if (!channel) {
      this.logger.warn(
        { guildId: member.guild.id, channelId: config.channelId },
        "Welcome channel is not sendable"
      );
      return false;
    }

    try {
      const image = await this.bannerService.create({
        displayName: member.displayName,
        username: member.user.username,
        guildName: member.guild.name,
        memberCount: member.guild.memberCount,
        avatarUrl: member.displayAvatarURL({ extension: "png", size: 512 })
      });
      const attachment = new AttachmentBuilder(image, {
        name: `welcome-${member.id}.png`
      });
      const content = renderWelcomeMessage(config.messageContent, {
        userId: member.id,
        username: member.user.username,
        displayName: member.displayName,
        guildName: member.guild.name,
        memberCount: member.guild.memberCount
      });

      await channel.send({
        content,
        files: [attachment],
        allowedMentions: { users: [member.id] }
      });
      this.logger.info({ guildId: member.guild.id, userId: member.id }, "Sent welcome banner");
      return true;
    } catch (error) {
      this.logger.warn(
        { error, guildId: member.guild.id, channelId: channel.id, userId: member.id },
        "Failed to send welcome banner"
      );
      return false;
    }
  }

  private async fetchSendableChannel(
    guild: Guild,
    channelId: string
  ): Promise<WelcomeSendableChannel | undefined> {
    const cached = guild.channels.cache.get(channelId);

    if (isWelcomeSendableChannel(cached)) {
      return cached;
    }

    const fetched = await guild.channels.fetch(channelId).catch(() => null);

    if (isWelcomeSendableChannel(fetched)) {
      return fetched;
    }

    return undefined;
  }
}

export function isWelcomeSendableChannel(channel: unknown): channel is WelcomeSendableChannel {
  return (
    typeof channel === "object" &&
    channel !== null &&
    "id" in channel &&
    typeof (channel as { id?: unknown }).id === "string" &&
    "send" in channel &&
    typeof (channel as { send?: unknown }).send === "function"
  );
}
