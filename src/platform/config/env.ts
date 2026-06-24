import { z } from "zod";

const logLevelSchema = z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]);

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  DISCORD_TOKEN: z.string().min(1, "DISCORD_TOKEN is required"),
  LOG_LEVEL: logLevelSchema.default("info"),
  HEALTHCHECK_FILE: z.string().default("/tmp/kakuzato-bot-ready")
});

export type AppConfig = {
  databaseUrl: string;
  discordToken: string;
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
    databaseUrl: result.data.DATABASE_URL,
    discordToken: result.data.DISCORD_TOKEN,
    logLevel: result.data.LOG_LEVEL,
    healthcheckFile: result.data.HEALTHCHECK_FILE
  };
}
