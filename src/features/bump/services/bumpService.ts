import { EmbedBuilder, type Client, type Guild, type GuildMember, type Message } from "discord.js";
import type { AppLogger } from "../../../platform/logger/logger";
import {
  bumpReminderCheckIntervalMs,
  bumpReminderDelayMs,
  bumpServices,
  getBumpServiceByBotId,
  getBumpServiceByKey,
  targetBumpRoleName,
  type BumpServiceDefinition,
  type BumpServiceKey
} from "../bumpServices";
import type { BumpConfig, BumpReminder, BumpRepository } from "../repositories/bumpRepository";
import { createBumpNotificationComponents, type BumpMessageComponent } from "./bumpComponents";

const defaultEmbedColor = 0x85e7ad;
const historySearchLimit = 100;
const reminderRetryDelayMs = 60_000;

type BumpEmbedLike = {
  title?: string | null;
  description?: string | null;
  fields?: readonly {
    name?: string | null;
    value?: string | null;
  }[];
};

export type BumpMessageLike = {
  author?: { id?: string | number } | null;
  content?: string | null;
  embeds?: readonly BumpEmbedLike[];
};

export type BumpSendableChannel = {
  id: string;
  send(options: {
    content?: string;
    embeds?: EmbedBuilder[];
    components?: BumpMessageComponent[];
    allowedMentions?: {
      roles?: string[];
      parse?: ("everyone" | "roles" | "users")[];
    };
  }): Promise<unknown>;
};

export type BumpHistoryChannel = BumpSendableChannel & {
  messages: {
    fetch(options: { limit: number }): Promise<ReadonlyMap<string, Message>>;
  };
};

type ReminderLoopOptions = {
  setInterval?: (callback: () => void, delayMs: number) => NodeJS.Timeout;
  clearInterval?: (timer: NodeJS.Timeout) => void;
};

export class BumpService {
  private readonly repository: BumpRepository;
  private readonly logger: AppLogger;
  private readonly setLoopInterval: (callback: () => void, delayMs: number) => NodeJS.Timeout;
  private readonly clearLoopInterval: (timer: NodeJS.Timeout) => void;
  private configuredGuildIds?: Set<string>;
  private reminderTimer?: NodeJS.Timeout;

  constructor(repository: BumpRepository, logger: AppLogger, options: ReminderLoopOptions = {}) {
    this.repository = repository;
    this.logger = logger;
    this.setLoopInterval = options.setInterval ?? setInterval;
    this.clearLoopInterval = options.clearInterval ?? clearInterval;
  }

  async loadConfiguredGuilds(): Promise<void> {
    const configs = await this.repository.listConfigs();
    this.configuredGuildIds = new Set(configs.map((config) => config.guildId));
    this.logger.info({ count: configs.length }, "Loaded bump monitoring configurations");
  }

  startReminderLoop(client: Client): void {
    if (this.reminderTimer) {
      return;
    }

    this.reminderTimer = this.setLoopInterval(() => {
      void this.sendDueReminders(client).catch((error) => {
        this.logger.error({ error }, "Failed to send due bump reminders");
      });
    }, bumpReminderCheckIntervalMs);
    this.reminderTimer.unref?.();
  }

  stopReminderLoop(): void {
    if (!this.reminderTimer) {
      return;
    }

    this.clearLoopInterval(this.reminderTimer);
    this.reminderTimer = undefined;
  }

  async getConfig(guildId: string): Promise<BumpConfig | undefined> {
    return this.repository.getConfig(guildId);
  }

  async listRemindersByGuild(guildId: string): Promise<BumpReminder[]> {
    return this.repository.listRemindersByGuild(guildId);
  }

  async setChannel(guildId: string, channelId: string): Promise<BumpConfig> {
    const config = await this.repository.setConfig(guildId, channelId);
    this.configuredGuildIds?.add(guildId);
    return config;
  }

  async disable(guildId: string): Promise<boolean> {
    const deleted = await this.repository.deleteConfig(guildId);
    await this.repository.deleteByGuild(guildId);
    this.configuredGuildIds?.delete(guildId);
    return deleted;
  }

  async deleteChannel(guildId: string, channelId: string): Promise<boolean> {
    const deleted = await this.repository.deleteByChannel(guildId, channelId);

    if (deleted) {
      this.configuredGuildIds?.delete(guildId);
    }

    return deleted;
  }

  async deleteByGuild(guildId: string): Promise<number> {
    const deleted = await this.repository.deleteByGuild(guildId);
    this.configuredGuildIds?.delete(guildId);
    return deleted;
  }

  async toggleReminder(guildId: string, serviceKey: BumpServiceKey): Promise<BumpReminder> {
    return this.repository.toggleReminder(guildId, serviceKey);
  }

  async setReminderRole(
    guildId: string,
    serviceKey: BumpServiceKey,
    roleId: string | undefined
  ): Promise<BumpReminder> {
    return this.repository.setReminderRole(guildId, serviceKey, roleId);
  }

  async handleMessage(message: Message): Promise<void> {
    if (!message.guild) {
      return;
    }

    const detectedService = detectBumpSuccess(message);

    if (!detectedService) {
      return;
    }

    const guildId = message.guild.id;

    if (this.configuredGuildIds && !this.configuredGuildIds.has(guildId)) {
      return;
    }

    const config = await this.repository.getConfig(guildId);

    if (config?.channelId !== message.channel.id) {
      return;
    }

    const member = await resolveBumpMember(message);

    if (!member) {
      this.logger.warn(
        { guildId, channelId: message.channel.id, serviceKey: detectedService.key },
        "Could not resolve bump command user"
      );
      return;
    }

    if (!hasBumpTargetRole(member)) {
      this.logger.info(
        { guildId, userId: member.id, roleName: targetBumpRoleName },
        "Bump user does not have required role"
      );
      return;
    }

    if (!isBumpSendableChannel(message.channel)) {
      this.logger.warn(
        { guildId, channelId: message.channel.id },
        "Bump monitoring channel is not sendable"
      );
      return;
    }

    const remindAt = new Date(Date.now() + bumpReminderDelayMs);
    const reminder = await this.repository.claimBumpDetection(
      guildId,
      message.channel.id,
      detectedService.key,
      remindAt
    );

    if (!reminder) {
      return;
    }

    const roleName = resolveReminderRoleName(message.guild, reminder.roleId);
    await message.channel.send({
      embeds: [
        createBumpDetectionEmbed({
          service: detectedService,
          member,
          remindAt,
          isEnabled: reminder.isEnabled,
          roleName
        })
      ],
      components: [
        createBumpNotificationComponents(guildId, detectedService.key, reminder.isEnabled)
      ]
    });
    this.logger.info(
      {
        guildId,
        serviceKey: detectedService.key,
        userId: member.id,
        remindAt: remindAt.toISOString()
      },
      "Detected bump success"
    );
  }

  async syncFromHistory(
    guild: Guild,
    channel: BumpHistoryChannel,
    now = new Date()
  ): Promise<{ ok: boolean; message: string; reminders: BumpReminder[] }> {
    const recentBumps = await this.findRecentBumps(channel);

    if (recentBumps.size === 0) {
      return {
        ok: false,
        message: "履歴から bump 成功メッセージを見つけられませんでした。",
        reminders: []
      };
    }

    const configured: string[] = [];
    const skipped: string[] = [];
    const reminders: BumpReminder[] = [];

    for (const [serviceKey, bumpTime] of recentBumps) {
      const remindAt = new Date(bumpTime.getTime() + bumpReminderDelayMs);
      const service = getBumpServiceByKey(serviceKey);

      if (remindAt <= now) {
        skipped.push(service?.name ?? serviceKey);
        continue;
      }

      const reminder = await this.repository.upsertReminder(
        guild.id,
        channel.id,
        serviceKey,
        remindAt
      );
      const timestamp = Math.trunc(remindAt.getTime() / 1_000);
      configured.push(
        `・${service?.name ?? serviceKey}: <t:${timestamp}:F> (通知: **${
          reminder.isEnabled ? "有効" : "無効"
        }**)`
      );
      reminders.push(reminder);
    }

    if (configured.length > 0) {
      return {
        ok: true,
        message: [
          "履歴から次回通知を設定しました。",
          ...configured,
          skipped.length > 0 ? `次回可能時刻を過ぎていたため未設定: ${skipped.join(" / ")}` : ""
        ]
          .filter(Boolean)
          .join("\n"),
        reminders
      };
    }

    return {
      ok: false,
      message:
        "履歴には bump 成功がありましたが、いずれも次回可能時刻を過ぎているため設定しませんでした。",
      reminders
    };
  }

  async sendDueReminders(client: Client, now = new Date()): Promise<void> {
    const reminders = await this.repository.getDueReminders(now);

    for (const reminder of reminders) {
      const retryAt = new Date(now.getTime() + reminderRetryDelayMs);
      const claimed = await this.repository.claimDueReminder(reminder.id, now, retryAt);

      if (!claimed) {
        continue;
      }

      try {
        await this.sendReminder(client, reminder);
        await this.repository.clearReminder(reminder.id, retryAt);
      } catch (error) {
        this.logger.warn(
          {
            error,
            guildId: reminder.guildId,
            channelId: reminder.channelId,
            serviceKey: reminder.serviceKey,
            retryAt: retryAt.toISOString()
          },
          "Failed to send bump reminder; it will be retried"
        );
      }
    }
  }

  private async findRecentBumps(channel: BumpHistoryChannel): Promise<Map<BumpServiceKey, Date>> {
    const messages = await channel.messages.fetch({ limit: historySearchLimit }).catch((error) => {
      this.logger.warn({ error, channelId: channel.id }, "Failed to fetch bump channel history");
      return undefined;
    });

    if (!messages) {
      return new Map();
    }

    const latest = new Map<BumpServiceKey, Date>();
    const sortedMessages = [...messages.values()].sort(
      (left, right) => right.createdTimestamp - left.createdTimestamp
    );

    for (const message of sortedMessages) {
      const service = detectBumpSuccess(message);

      if (!service || latest.has(service.key)) {
        continue;
      }

      latest.set(service.key, message.createdAt);

      if (latest.size === bumpServices.length) {
        break;
      }
    }

    return latest;
  }

  private async sendReminder(client: Client, reminder: BumpReminder): Promise<void> {
    const channel = await fetchBumpSendableChannel(client, reminder.channelId);

    if (!channel) {
      this.logger.warn(
        {
          guildId: reminder.guildId,
          channelId: reminder.channelId,
          serviceKey: reminder.serviceKey
        },
        "Bump reminder channel is not sendable"
      );
      return;
    }

    const guild = "guild" in channel ? (channel as { guild?: Guild }).guild : undefined;
    const target = guild
      ? resolveReminderMention(guild, reminder.roleId)
      : {
          content: "@here",
          allowedMentions: { parse: ["everyone" as const] }
        };
    const service = getBumpServiceByKey(reminder.serviceKey);

    await channel.send({
      content: target.content,
      embeds: [createBumpReminderEmbed(service?.name ?? reminder.serviceKey)],
      components: [
        createBumpNotificationComponents(reminder.guildId, reminder.serviceKey, reminder.isEnabled)
      ],
      allowedMentions: target.allowedMentions
    });
    this.logger.info(
      { guildId: reminder.guildId, serviceKey: reminder.serviceKey },
      "Sent bump reminder"
    );
  }
}

export function detectBumpSuccess(message: BumpMessageLike): BumpServiceDefinition | undefined {
  const authorId = String(message.author?.id ?? "");
  const service = getBumpServiceByBotId(authorId);

  if (!service) {
    return undefined;
  }

  for (const embed of message.embeds ?? []) {
    const title = embed.title ?? "";
    const description = embed.description ?? "";
    const fields = embed.fields ?? [];

    for (const keyword of service.successKeywords) {
      if (service.checkTitle && title.includes(keyword)) {
        return service;
      }

      if (service.checkDescription && description.includes(keyword)) {
        return service;
      }

      if (
        service.checkFields &&
        fields.some(
          (field) => (field.name ?? "").includes(keyword) || (field.value ?? "").includes(keyword)
        )
      ) {
        return service;
      }
    }
  }

  if (service.checkContent) {
    const content = message.content ?? "";

    if (service.successKeywords.some((keyword) => content.includes(keyword))) {
      return service;
    }
  }

  return undefined;
}

export function createBumpDetectionEmbed(input: {
  service: Pick<BumpServiceDefinition, "name">;
  member: { toString(): string };
  remindAt: Date;
  isEnabled: boolean;
  roleName?: string;
}): EmbedBuilder {
  const timestamp = Math.trunc(input.remindAt.getTime() / 1_000);
  const displayRole = input.roleName ?? targetBumpRoleName;
  const description = input.isEnabled
    ? [
        `${input.member.toString()} さんが **${input.service.name}** を bump しました！`,
        "",
        `次の bump リマインドは <t:${timestamp}:t> に送信します。`,
        `現在の通知先: \`@${displayRole}\``
      ].join("\n")
    : [
        `${input.member.toString()} さんが **${input.service.name}** を bump しました！`,
        "",
        "通知は現在 **無効** です。",
        `現在の通知先: \`@${displayRole}\``
      ].join("\n");

  return new EmbedBuilder()
    .setTitle("Bump 検知")
    .setDescription(description)
    .setColor(defaultEmbedColor)
    .setTimestamp(new Date())
    .setFooter({ text: input.service.name });
}

export function createBumpReminderEmbed(serviceName: string): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle("Bump リマインダー")
    .setDescription(
      [
        `**${serviceName}** の bump ができるようになりました！`,
        "",
        "サーバーを上位に表示させるために bump しましょう。"
      ].join("\n")
    )
    .setColor(defaultEmbedColor)
    .setTimestamp(new Date())
    .setFooter({ text: serviceName });
}

export function isBumpSendableChannel(channel: unknown): channel is BumpSendableChannel {
  return (
    typeof channel === "object" &&
    channel !== null &&
    "id" in channel &&
    typeof (channel as { id?: unknown }).id === "string" &&
    "send" in channel &&
    typeof (channel as { send?: unknown }).send === "function"
  );
}

export function isBumpHistoryChannel(channel: unknown): channel is BumpHistoryChannel {
  return (
    isBumpSendableChannel(channel) &&
    "messages" in channel &&
    typeof (channel as { messages?: { fetch?: unknown } }).messages?.fetch === "function"
  );
}

async function resolveBumpMember(message: Message): Promise<GuildMember | undefined> {
  const interactionUserId = getInteractionUserId(message);

  if (!interactionUserId || !message.guild) {
    return undefined;
  }

  return (
    message.guild.members.cache.get(interactionUserId) ??
    (await message.guild.members.fetch(interactionUserId).catch(() => null)) ??
    undefined
  );
}

function getInteractionUserId(message: Message): string | undefined {
  const metadata = message as {
    interactionMetadata?: { user?: { id?: string } | null } | null;
    interaction?: { user?: { id?: string } | null } | null;
  };

  return metadata.interactionMetadata?.user?.id ?? metadata.interaction?.user?.id;
}

function hasBumpTargetRole(member: GuildMember): boolean {
  return member.roles.cache.some((role) => role.name === targetBumpRoleName);
}

function resolveReminderRoleName(guild: Guild, roleId: string | undefined): string | undefined {
  if (!roleId) {
    return undefined;
  }

  return guild.roles.cache.get(roleId)?.name;
}

function resolveReminderMention(
  guild: Guild,
  roleId: string | undefined
): {
  content: string;
  allowedMentions: { roles?: string[]; parse?: ("everyone" | "roles" | "users")[] };
} {
  const customRole = roleId ? guild.roles.cache.get(roleId) : undefined;
  const targetRole =
    customRole ?? guild.roles.cache.find((role) => role.name === targetBumpRoleName);

  if (targetRole) {
    return {
      content: targetRole.toString(),
      allowedMentions: {
        roles: [targetRole.id],
        parse: []
      }
    };
  }

  return {
    content: "@here",
    allowedMentions: {
      parse: ["everyone"]
    }
  };
}

async function fetchBumpSendableChannel(
  client: Client,
  channelId: string
): Promise<BumpSendableChannel | undefined> {
  const cached = client.channels.cache.get(channelId);

  if (isBumpSendableChannel(cached)) {
    return cached;
  }

  const fetched = await client.channels.fetch(channelId).catch(() => null);

  if (isBumpSendableChannel(fetched)) {
    return fetched;
  }

  return undefined;
}
