import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type StickyMessageType = "text" | "embed";

export type StickyMessageConfig = {
  guildId: string;
  channelId: string;
  messageId?: string;
  messageType: StickyMessageType;
  title: string;
  description: string;
  color?: number;
  delaySeconds: number;
  lastPostedAt?: string;
  updatedAt: string;
};

type StickyMessageConfigFile = {
  channels: Record<string, StickyMessageConfig>;
};

export const defaultStickyDelaySeconds = 5;
export const defaultStickyEmbedColor = 0x85e7ad;
export const maxStickyDelaySeconds = 3_600;
export const minStickyDelaySeconds = 1;

export class StickyMessageRepository {
  private readonly filePath: string;
  private pendingWrite: Promise<void> = Promise.resolve();

  constructor(filePath: string) {
    this.filePath = path.resolve(filePath);
  }

  async get(channelId: string): Promise<StickyMessageConfig | undefined> {
    const data = await this.read();
    return data.channels[channelId];
  }

  async list(): Promise<StickyMessageConfig[]> {
    const data = await this.read();
    return Object.values(data.channels);
  }

  async set(config: Omit<StickyMessageConfig, "updatedAt">): Promise<StickyMessageConfig> {
    const nextConfig = normalizeConfig(config.channelId, {
      ...config,
      updatedAt: new Date().toISOString()
    });

    await this.update((data) => {
      data.channels[nextConfig.channelId] = nextConfig;
    });

    return nextConfig;
  }

  async updateMessage(
    channelId: string,
    messageId: string,
    lastPostedAt: string
  ): Promise<StickyMessageConfig | undefined> {
    let config: StickyMessageConfig | undefined;

    await this.update((data) => {
      const current = data.channels[channelId];

      if (!current) {
        return;
      }

      config = {
        ...current,
        messageId,
        lastPostedAt,
        updatedAt: new Date().toISOString()
      };
      data.channels[channelId] = config;
    });

    return config;
  }

  async delete(channelId: string): Promise<StickyMessageConfig | undefined> {
    let config: StickyMessageConfig | undefined;

    await this.update((data) => {
      config = data.channels[channelId];
      delete data.channels[channelId];
    });

    return config;
  }

  async deleteByGuild(guildId: string): Promise<number> {
    let deleted = 0;

    await this.update((data) => {
      for (const [channelId, config] of Object.entries(data.channels)) {
        if (config.guildId === guildId) {
          delete data.channels[channelId];
          deleted += 1;
        }
      }
    });

    return deleted;
  }

  private async update(mutator: (data: StickyMessageConfigFile) => void): Promise<void> {
    const write = this.pendingWrite
      .catch(() => undefined)
      .then(async () => {
        const data = await this.read();
        mutator(data);
        await mkdir(path.dirname(this.filePath), { recursive: true });
        await writeFile(this.filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
      });

    this.pendingWrite = write.catch(() => undefined);

    await write;
  }

  private async read(): Promise<StickyMessageConfigFile> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<{
        channels: Record<string, Partial<StickyMessageConfig>>;
      }>;

      return {
        channels: Object.fromEntries(
          Object.entries(parsed.channels ?? {}).map(([channelId, config]) => [
            channelId,
            normalizeConfig(channelId, config)
          ])
        )
      };
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        return { channels: {} };
      }

      throw error;
    }
  }
}

export function normalizeStickyDelaySeconds(value: number | undefined): number {
  if (!Number.isFinite(value)) {
    return defaultStickyDelaySeconds;
  }

  return Math.min(
    maxStickyDelaySeconds,
    Math.max(minStickyDelaySeconds, Math.trunc(value ?? defaultStickyDelaySeconds))
  );
}

function normalizeConfig(
  channelId: string,
  config: Partial<StickyMessageConfig>
): StickyMessageConfig {
  return {
    guildId: config.guildId ?? "",
    channelId: config.channelId ?? channelId,
    messageId: config.messageId,
    messageType: config.messageType === "text" ? "text" : "embed",
    title: config.title ?? "",
    description: config.description ?? "",
    color: normalizeColor(config.color),
    delaySeconds: normalizeStickyDelaySeconds(config.delaySeconds),
    lastPostedAt: config.lastPostedAt,
    updatedAt: config.updatedAt ?? new Date(0).toISOString()
  };
}

function normalizeColor(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return undefined;
  }

  if (value < 0 || value > 0xffffff) {
    return undefined;
  }

  return value;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
