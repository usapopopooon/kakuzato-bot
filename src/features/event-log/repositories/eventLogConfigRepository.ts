import type { AppPrismaClient } from "../../../platform/database/prisma";
import {
  defaultEventLogCategories,
  isEventLogCategory,
  type EventLogCategory
} from "../eventLogCategories";

export type EventLogConfig = {
  guildId: string;
  channelId: string;
  enabled: boolean;
  enabledCategories: EventLogCategory[];
  updatedAt: string;
};

export class EventLogConfigRepository {
  private readonly prisma: Pick<AppPrismaClient, "eventLogConfig">;

  constructor(prisma: Pick<AppPrismaClient, "eventLogConfig">) {
    this.prisma = prisma;
  }

  async get(guildId: string): Promise<EventLogConfig | undefined> {
    const config = await this.prisma.eventLogConfig.findUnique({
      where: { guildId }
    });

    return config ? toEventLogConfig(config) : undefined;
  }

  async setChannel(guildId: string, channelId: string): Promise<EventLogConfig> {
    const config = await this.prisma.eventLogConfig.upsert({
      where: { guildId },
      create: {
        guildId,
        channelId,
        enabled: true,
        enabledCategories: [...defaultEventLogCategories]
      },
      update: {
        channelId,
        enabled: true
      }
    });

    return toEventLogConfig(config);
  }

  async setCategory(
    guildId: string,
    category: EventLogCategory,
    enabled: boolean
  ): Promise<EventLogConfig | undefined> {
    const current = await this.prisma.eventLogConfig.findUnique({
      where: { guildId }
    });

    if (!current) {
      return undefined;
    }

    const categories = new Set(normalizeCategories(current.enabledCategories));

    if (enabled) {
      categories.add(category);
    } else {
      categories.delete(category);
    }

    const config = await this.prisma.eventLogConfig.update({
      where: { guildId },
      data: {
        enabledCategories: [...defaultEventLogCategories].filter((candidate) =>
          categories.has(candidate)
        )
      }
    });

    return toEventLogConfig(config);
  }

  async disable(guildId: string): Promise<EventLogConfig | undefined> {
    const config = await this.prisma.eventLogConfig
      .update({
        where: { guildId },
        data: { enabled: false }
      })
      .catch((error: unknown) => {
        if (isRecordNotFoundError(error)) {
          return undefined;
        }

        throw error;
      });

    return config ? toEventLogConfig(config) : undefined;
  }
}

function toEventLogConfig(config: {
  guildId: string;
  channelId: string;
  enabled: boolean;
  enabledCategories: string[];
  updatedAt: Date;
}): EventLogConfig {
  return {
    guildId: config.guildId,
    channelId: config.channelId,
    enabled: config.enabled,
    enabledCategories: normalizeCategories(config.enabledCategories),
    updatedAt: config.updatedAt.toISOString()
  };
}

function normalizeCategories(categories: readonly string[]): EventLogCategory[] {
  return categories.filter((category): category is EventLogCategory =>
    isEventLogCategory(category)
  );
}

function isRecordNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2025"
  );
}
