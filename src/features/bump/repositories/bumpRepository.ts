import type { AppPrismaClient } from "../../../platform/database/prisma";
import type { BumpServiceKey } from "../bumpServices";

export type BumpConfig = {
  guildId: string;
  channelId: string;
  createdAt: string;
  updatedAt: string;
};

export type BumpReminder = {
  id: number;
  guildId: string;
  channelId: string;
  serviceKey: BumpServiceKey;
  remindAt?: string;
  isEnabled: boolean;
  roleId?: string;
  createdAt: string;
  updatedAt: string;
};

type BumpPrisma = Pick<AppPrismaClient, "bumpConfig" | "bumpReminder">;

export class BumpRepository {
  private readonly prisma: BumpPrisma;

  constructor(prisma: BumpPrisma) {
    this.prisma = prisma;
  }

  async getConfig(guildId: string): Promise<BumpConfig | undefined> {
    const config = await this.prisma.bumpConfig.findUnique({
      where: { guildId }
    });

    return config ? toBumpConfig(config) : undefined;
  }

  async listConfigs(): Promise<BumpConfig[]> {
    const configs = await this.prisma.bumpConfig.findMany();
    return configs.map(toBumpConfig);
  }

  async setConfig(guildId: string, channelId: string): Promise<BumpConfig> {
    const config = await this.prisma.bumpConfig.upsert({
      where: { guildId },
      create: { guildId, channelId },
      update: { channelId }
    });

    return toBumpConfig(config);
  }

  async deleteConfig(guildId: string): Promise<boolean> {
    const result = await this.prisma.bumpConfig.deleteMany({
      where: { guildId }
    });

    return result.count > 0;
  }

  async deleteByGuild(guildId: string): Promise<number> {
    const reminderResult = await this.prisma.bumpReminder.deleteMany({
      where: { guildId }
    });
    await this.prisma.bumpConfig.deleteMany({
      where: { guildId }
    });

    return reminderResult.count;
  }

  async deleteByChannel(guildId: string, channelId: string): Promise<boolean> {
    const config = await this.getConfig(guildId);

    if (config?.channelId !== channelId) {
      return false;
    }

    await this.deleteByGuild(guildId);
    return true;
  }

  async getReminder(
    guildId: string,
    serviceKey: BumpServiceKey
  ): Promise<BumpReminder | undefined> {
    const reminder = await this.prisma.bumpReminder.findUnique({
      where: {
        guildId_serviceKey: {
          guildId,
          serviceKey
        }
      }
    });

    return reminder ? toBumpReminder(reminder) : undefined;
  }

  async listRemindersByGuild(guildId: string): Promise<BumpReminder[]> {
    const reminders = await this.prisma.bumpReminder.findMany({
      where: { guildId }
    });

    return reminders.map(toBumpReminder);
  }

  async upsertReminder(
    guildId: string,
    channelId: string,
    serviceKey: BumpServiceKey,
    remindAt: Date
  ): Promise<BumpReminder> {
    const reminder = await this.prisma.bumpReminder.upsert({
      where: {
        guildId_serviceKey: {
          guildId,
          serviceKey
        }
      },
      create: {
        guildId,
        channelId,
        serviceKey,
        remindAt
      },
      update: {
        channelId,
        remindAt
      }
    });

    return toBumpReminder(reminder);
  }

  async claimBumpDetection(
    guildId: string,
    channelId: string,
    serviceKey: BumpServiceKey,
    remindAt: Date
  ): Promise<BumpReminder | undefined> {
    const duplicateThreshold = new Date(remindAt.getTime() - 60_000);
    const result = await this.prisma.bumpReminder.updateMany({
      where: {
        guildId,
        serviceKey,
        OR: [{ remindAt: null }, { remindAt: { lte: duplicateThreshold } }]
      },
      data: {
        channelId,
        remindAt
      }
    });

    if (result.count > 0) {
      return this.getReminder(guildId, serviceKey);
    }

    const existing = await this.getReminder(guildId, serviceKey);

    if (existing) {
      return undefined;
    }

    try {
      const reminder = await this.prisma.bumpReminder.create({
        data: {
          guildId,
          channelId,
          serviceKey,
          remindAt
        }
      });
      return toBumpReminder(reminder);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return undefined;
      }

      throw error;
    }
  }

  async getDueReminders(now: Date): Promise<BumpReminder[]> {
    const reminders = await this.prisma.bumpReminder.findMany({
      where: {
        isEnabled: true,
        remindAt: {
          lte: now
        }
      },
      orderBy: { remindAt: "asc" }
    });

    return reminders.map(toBumpReminder);
  }

  async claimDueReminder(id: number, now: Date, retryAt: Date): Promise<boolean> {
    const result = await this.prisma.bumpReminder.updateMany({
      where: {
        id,
        isEnabled: true,
        remindAt: {
          lte: now
        }
      },
      data: {
        remindAt: retryAt
      }
    });

    return result.count > 0;
  }

  async clearReminder(id: number, expectedRemindAt?: Date): Promise<boolean> {
    const result = await this.prisma.bumpReminder.updateMany({
      where: {
        id,
        remindAt: expectedRemindAt ? { equals: expectedRemindAt } : { not: null }
      },
      data: {
        remindAt: null
      }
    });

    return result.count > 0;
  }

  async toggleReminder(guildId: string, serviceKey: BumpServiceKey): Promise<BumpReminder> {
    const current = await this.getReminder(guildId, serviceKey);

    if (!current) {
      const reminder = await this.prisma.bumpReminder.create({
        data: {
          guildId,
          serviceKey,
          isEnabled: false
        }
      });
      return toBumpReminder(reminder);
    }

    const reminder = await this.prisma.bumpReminder.update({
      where: {
        guildId_serviceKey: {
          guildId,
          serviceKey
        }
      },
      data: {
        isEnabled: !current.isEnabled
      }
    });

    return toBumpReminder(reminder);
  }

  async setReminderRole(
    guildId: string,
    serviceKey: BumpServiceKey,
    roleId: string | undefined
  ): Promise<BumpReminder> {
    const reminder = await this.prisma.bumpReminder.upsert({
      where: {
        guildId_serviceKey: {
          guildId,
          serviceKey
        }
      },
      create: {
        guildId,
        serviceKey,
        roleId: roleId ?? null
      },
      update: {
        roleId: roleId ?? null
      }
    });

    return toBumpReminder(reminder);
  }
}

function toBumpConfig(config: {
  guildId: string;
  channelId: string;
  createdAt: Date;
  updatedAt: Date;
}): BumpConfig {
  return {
    guildId: config.guildId,
    channelId: config.channelId,
    createdAt: config.createdAt.toISOString(),
    updatedAt: config.updatedAt.toISOString()
  };
}

function toBumpReminder(reminder: {
  id: number;
  guildId: string;
  channelId: string;
  serviceKey: string;
  remindAt: Date | null;
  isEnabled: boolean;
  roleId: string | null;
  createdAt: Date;
  updatedAt: Date;
}): BumpReminder {
  return {
    id: reminder.id,
    guildId: reminder.guildId,
    channelId: reminder.channelId,
    serviceKey: reminder.serviceKey === "DISBOARD" ? "DISBOARD" : "DISSOKU",
    remindAt: reminder.remindAt?.toISOString(),
    isEnabled: reminder.isEnabled,
    roleId: reminder.roleId ?? undefined,
    createdAt: reminder.createdAt.toISOString(),
    updatedAt: reminder.updatedAt.toISOString()
  };
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}
