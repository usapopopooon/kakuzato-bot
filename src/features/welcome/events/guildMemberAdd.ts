import { AttachmentBuilder, Events, type GuildMember } from "discord.js";
import type { AppConfig } from "../../../platform/config/env";
import type { DiscordEventHandler } from "../../../platform/discord/botModule";
import type { AppLogger } from "../../../platform/logger/logger";
import type { JoinBannerService } from "../services/joinBannerService";
import { renderWelcomeMessage } from "../services/welcomeMessage";

type WelcomeConfig = Pick<
  AppConfig,
  "welcomeChannelId" | "welcomeGuildId" | "welcomeMessageContent"
>;

type GuildMemberAddDeps = {
  config: WelcomeConfig;
  bannerService: JoinBannerService;
  logger: AppLogger;
};

type SendableChannel = {
  send(options: {
    content: string;
    files: AttachmentBuilder[];
    allowedMentions: { users: string[] };
  }): Promise<unknown>;
};

export function createGuildMemberAddEvent(
  deps: GuildMemberAddDeps
): DiscordEventHandler<typeof Events.GuildMemberAdd> {
  return {
    name: Events.GuildMemberAdd,
    execute: (member) => handleGuildMemberAdd(member, deps)
  };
}

export async function handleGuildMemberAdd(
  member: GuildMember,
  deps: GuildMemberAddDeps
): Promise<void> {
  if (deps.config.welcomeGuildId && deps.config.welcomeGuildId !== member.guild.id) {
    return;
  }

  const channel = await member.guild.channels.fetch(deps.config.welcomeChannelId);

  if (!isSendableChannel(channel)) {
    deps.logger.warn(
      { guildId: member.guild.id, channelId: deps.config.welcomeChannelId },
      "Welcome channel is not sendable"
    );
    return;
  }

  const image = await deps.bannerService.create({
    displayName: member.displayName,
    username: member.user.username,
    guildName: member.guild.name,
    memberCount: member.guild.memberCount,
    avatarUrl: member.displayAvatarURL({ extension: "png", size: 512 })
  });
  const attachment = new AttachmentBuilder(image, {
    name: `welcome-${member.id}.png`
  });
  const content = renderWelcomeMessage(deps.config.welcomeMessageContent, {
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

  deps.logger.info({ guildId: member.guild.id, userId: member.id }, "Sent welcome banner");
}

function isSendableChannel(channel: unknown): channel is SendableChannel {
  return (
    typeof channel === "object" &&
    channel !== null &&
    "send" in channel &&
    typeof (channel as { send?: unknown }).send === "function"
  );
}
