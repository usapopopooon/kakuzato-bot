import { z } from "zod";

const logLevelSchema = z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]);

const envSchema = z.object({
  DISCORD_TOKEN: z.string().min(1, "DISCORD_TOKEN is required"),
  WELCOME_CHANNEL_ID: z.string().min(1, "WELCOME_CHANNEL_ID is required"),
  WELCOME_GUILD_ID: z.string().optional(),
  WELCOME_MESSAGE_CONTENT: z.string().default("Welcome, {mention}!"),
  BOT_ACTIVITY_NAME: z.string().default("サーバーを管理中。"),
  JOIN_BANNER_TEMPLATE_PATH: z.string().default("static/img/join-banner-template.png"),
  LOG_LEVEL: logLevelSchema.default("info"),
  HEALTHCHECK_FILE: z.string().default("/tmp/kakuzato-bot-ready")
});

export type AppConfig = {
  discordToken: string;
  welcomeChannelId: string;
  welcomeGuildId?: string;
  welcomeMessageContent: string;
  botActivityName: string;
  joinBannerTemplatePath: string;
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
    welcomeChannelId: result.data.WELCOME_CHANNEL_ID,
    welcomeGuildId: emptyToUndefined(result.data.WELCOME_GUILD_ID),
    welcomeMessageContent: result.data.WELCOME_MESSAGE_CONTENT,
    botActivityName: result.data.BOT_ACTIVITY_NAME,
    joinBannerTemplatePath: result.data.JOIN_BANNER_TEMPLATE_PATH,
    logLevel: result.data.LOG_LEVEL,
    healthcheckFile: result.data.HEALTHCHECK_FILE
  };
}

function emptyToUndefined(value: string | undefined): string | undefined {
  return value && value.trim().length > 0 ? value : undefined;
}
