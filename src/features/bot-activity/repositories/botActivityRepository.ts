import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const defaultBotActivityName = "サーバーを管理中。";

export type BotActivityConfig = {
  activityName: string;
  updatedAt: string;
};

type BotActivityConfigFile = Partial<BotActivityConfig>;

export class BotActivityRepository {
  private readonly filePath: string;
  private pendingWrite: Promise<void> = Promise.resolve();

  constructor(filePath: string) {
    this.filePath = path.resolve(filePath);
  }

  async get(): Promise<BotActivityConfig> {
    return this.read();
  }

  async setName(activityName: string): Promise<BotActivityConfig> {
    const config = {
      activityName,
      updatedAt: new Date().toISOString()
    };

    await this.update(config);

    return config;
  }

  async reset(): Promise<BotActivityConfig> {
    return this.setName(defaultBotActivityName);
  }

  private async update(config: BotActivityConfig): Promise<void> {
    const write = this.pendingWrite
      .catch(() => undefined)
      .then(async () => {
        await mkdir(path.dirname(this.filePath), { recursive: true });
        await writeFile(this.filePath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
      });

    this.pendingWrite = write.catch(() => undefined);

    await write;
  }

  private async read(): Promise<BotActivityConfig> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as BotActivityConfigFile;

      return normalizeConfig(parsed);
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        return normalizeConfig({});
      }

      throw error;
    }
  }
}

function normalizeConfig(config: BotActivityConfigFile): BotActivityConfig {
  const activityName =
    typeof config.activityName === "string" && config.activityName.trim().length > 0
      ? config.activityName
      : defaultBotActivityName;

  return {
    activityName,
    updatedAt: config.updatedAt ?? new Date(0).toISOString()
  };
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
