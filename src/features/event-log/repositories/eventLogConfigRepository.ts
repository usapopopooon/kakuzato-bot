import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
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

type EventLogConfigFile = {
  guilds: Record<string, EventLogConfig>;
};

export class EventLogConfigRepository {
  private readonly filePath: string;
  private pendingWrite: Promise<void> = Promise.resolve();

  constructor(filePath: string) {
    this.filePath = path.resolve(filePath);
  }

  async get(guildId: string): Promise<EventLogConfig | undefined> {
    const data = await this.read();
    return data.guilds[guildId];
  }

  async setChannel(guildId: string, channelId: string): Promise<EventLogConfig> {
    let config: EventLogConfig | undefined;

    await this.update((data) => {
      const current = data.guilds[guildId];
      config = {
        guildId,
        channelId,
        enabled: true,
        enabledCategories: current?.enabledCategories ?? [...defaultEventLogCategories],
        updatedAt: new Date().toISOString()
      };
      data.guilds[guildId] = config;
    });

    if (!config) {
      throw new Error("Failed to persist event log config");
    }

    return config;
  }

  async setCategory(
    guildId: string,
    category: EventLogCategory,
    enabled: boolean
  ): Promise<EventLogConfig | undefined> {
    let config: EventLogConfig | undefined;

    await this.update((data) => {
      const current = data.guilds[guildId];

      if (!current) {
        return;
      }

      const categories = new Set(current.enabledCategories);

      if (enabled) {
        categories.add(category);
      } else {
        categories.delete(category);
      }

      config = {
        ...current,
        enabledCategories: [...defaultEventLogCategories].filter((candidate) =>
          categories.has(candidate)
        ),
        updatedAt: new Date().toISOString()
      };
      data.guilds[guildId] = config;
    });

    return config;
  }

  async disable(guildId: string): Promise<EventLogConfig | undefined> {
    let config: EventLogConfig | undefined;

    await this.update((data) => {
      const current = data.guilds[guildId];

      if (!current) {
        return;
      }

      config = {
        ...current,
        enabled: false,
        updatedAt: new Date().toISOString()
      };
      data.guilds[guildId] = config;
    });

    return config;
  }

  private async update(mutator: (data: EventLogConfigFile) => void): Promise<void> {
    this.pendingWrite = this.pendingWrite.then(async () => {
      const data = await this.read();
      mutator(data);
      await mkdir(path.dirname(this.filePath), { recursive: true });
      await writeFile(this.filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    });

    await this.pendingWrite;
  }

  private async read(): Promise<EventLogConfigFile> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<{
        guilds: Record<string, Partial<EventLogConfig>>;
      }>;
      return {
        guilds: Object.fromEntries(
          Object.entries(parsed.guilds ?? {}).map(([guildId, config]) => [
            guildId,
            normalizeConfig(guildId, config)
          ])
        )
      };
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        return { guilds: {} };
      }

      throw error;
    }
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function normalizeConfig(guildId: string, config: Partial<EventLogConfig>): EventLogConfig {
  const enabledCategories = Array.isArray(config.enabledCategories)
    ? config.enabledCategories.filter((category): category is EventLogCategory =>
        isEventLogCategory(category)
      )
    : [...defaultEventLogCategories];

  return {
    guildId: config.guildId ?? guildId,
    channelId: config.channelId ?? "",
    enabled: config.enabled ?? false,
    enabledCategories,
    updatedAt: config.updatedAt ?? new Date(0).toISOString()
  };
}
