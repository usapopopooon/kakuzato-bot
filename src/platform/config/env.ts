import { z } from "zod";

const logLevelSchema = z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]);

const envSchema = z.object({
  DISCORD_TOKEN: z.string().min(1, "DISCORD_TOKEN is required"),
  EVENT_LOG_CONFIG_PATH: z.string().default("data/event-log-configs.json"),
  LOG_LEVEL: logLevelSchema.default("info"),
  HEALTHCHECK_FILE: z.string().default("/tmp/kakuzato-bot-ready")
});

export type AppConfig = {
  discordToken: string;
  eventLogConfigPath: string;
  logLevel: z.infer<typeof logLevelSchema>;
  healthcheckFile: string;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = envSchema.safeParse(env);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join(", ");

    throw new Error(`Invalid environment: ${details}`);
  }

  return {
    discordToken: result.data.DISCORD_TOKEN,
    eventLogConfigPath: result.data.EVENT_LOG_CONFIG_PATH,
    logLevel: result.data.LOG_LEVEL,
    healthcheckFile: result.data.HEALTHCHECK_FILE
  };
}
