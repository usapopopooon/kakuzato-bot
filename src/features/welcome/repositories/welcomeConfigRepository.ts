import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const defaultWelcomeMessageContent = "Welcome, {mention}!";

export type WelcomeConfig = {
  guildId: string;
  channelId: string;
  enabled: boolean;
  messageContent: string;
  updatedAt: string;
};

type WelcomeConfigFile = {
  guilds: Record<string, WelcomeConfig>;
};

export class WelcomeConfigRepository {
  private readonly filePath: string;
  private pendingWrite: Promise<void> = Promise.resolve();

  constructor(filePath: string) {
    this.filePath = path.resolve(filePath);
  }

  async get(guildId: string): Promise<WelcomeConfig | undefined> {
    const data = await this.read();
    return data.guilds[guildId];
  }

  async setChannel(guildId: string, channelId: string): Promise<WelcomeConfig> {
    let config: WelcomeConfig | undefined;

    await this.update((data) => {
      const current = data.guilds[guildId];
      config = {
        guildId,
        channelId,
        enabled: true,
        messageContent: current?.messageContent ?? defaultWelcomeMessageContent,
        updatedAt: new Date().toISOString()
      };
      data.guilds[guildId] = config;
    });

    if (!config) {
      throw new Error("Failed to persist welcome config");
    }

    return config;
  }

  async setMessage(guildId: string, messageContent: string): Promise<WelcomeConfig | undefined> {
    let config: WelcomeConfig | undefined;

    await this.update((data) => {
      const current = data.guilds[guildId];

      if (!current) {
        return;
      }

      config = {
        ...current,
        messageContent,
        updatedAt: new Date().toISOString()
      };
      data.guilds[guildId] = config;
    });

    return config;
  }

  async disable(guildId: string): Promise<WelcomeConfig | undefined> {
    let config: WelcomeConfig | undefined;

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

  private async update(mutator: (data: WelcomeConfigFile) => void): Promise<void> {
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

  private async read(): Promise<WelcomeConfigFile> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<{
        guilds: Record<string, Partial<WelcomeConfig>>;
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

function normalizeConfig(guildId: string, config: Partial<WelcomeConfig>): WelcomeConfig {
  const channelId = config.channelId ?? "";

  return {
    guildId: config.guildId ?? guildId,
    channelId,
    enabled: config.enabled ?? false,
    messageContent: config.messageContent ?? defaultWelcomeMessageContent,
    updatedAt: config.updatedAt ?? new Date(0).toISOString()
  };
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
