CREATE TYPE "StickyMessageType" AS ENUM ('TEXT', 'EMBED');

CREATE TYPE "BumpServiceKey" AS ENUM ('DISBOARD', 'DISSOKU');

CREATE TABLE "BotActivityConfig" (
  "id" TEXT NOT NULL DEFAULT 'global',
  "activityName" VARCHAR(128) NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "BotActivityConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WelcomeConfig" (
  "guildId" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "messageContent" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "WelcomeConfig_pkey" PRIMARY KEY ("guildId")
);

CREATE TABLE "EventLogConfig" (
  "guildId" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "enabledCategories" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "EventLogConfig_pkey" PRIMARY KEY ("guildId")
);

CREATE TABLE "StickyMessageConfig" (
  "channelId" TEXT NOT NULL,
  "guildId" TEXT NOT NULL,
  "messageId" TEXT,
  "messageType" "StickyMessageType" NOT NULL,
  "title" TEXT NOT NULL DEFAULT '',
  "description" TEXT NOT NULL,
  "color" INTEGER,
  "delaySeconds" INTEGER NOT NULL DEFAULT 5,
  "lastPostedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "StickyMessageConfig_pkey" PRIMARY KEY ("channelId")
);

CREATE TABLE "BumpConfig" (
  "guildId" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "BumpConfig_pkey" PRIMARY KEY ("guildId")
);

CREATE TABLE "BumpReminder" (
  "id" SERIAL NOT NULL,
  "guildId" TEXT NOT NULL,
  "channelId" TEXT NOT NULL DEFAULT '',
  "serviceKey" "BumpServiceKey" NOT NULL,
  "remindAt" TIMESTAMP(3),
  "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "roleId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "BumpReminder_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StickyMessageConfig_guildId_idx" ON "StickyMessageConfig"("guildId");

CREATE INDEX "BumpReminder_guildId_idx" ON "BumpReminder"("guildId");

CREATE INDEX "BumpReminder_isEnabled_remindAt_idx" ON "BumpReminder"("isEnabled", "remindAt");

CREATE UNIQUE INDEX "BumpReminder_guildId_serviceKey_key" ON "BumpReminder"("guildId", "serviceKey");
