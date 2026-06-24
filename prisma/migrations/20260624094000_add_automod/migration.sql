CREATE TYPE "AutoModRuleType" AS ENUM ('NO_AVATAR', 'ACCOUNT_AGE');

CREATE TYPE "AutoModAction" AS ENUM ('BAN', 'KICK', 'TIMEOUT');

CREATE TYPE "AutoModActionTaken" AS ENUM ('BANNED', 'KICKED', 'TIMED_OUT');

CREATE TYPE "AutoModLogStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED');

CREATE TABLE "AutoModConfig" (
  "guildId" TEXT NOT NULL,
  "logChannelId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AutoModConfig_pkey" PRIMARY KEY ("guildId")
);

CREATE TABLE "AutoModRule" (
  "id" SERIAL NOT NULL,
  "guildId" TEXT NOT NULL,
  "ruleType" "AutoModRuleType" NOT NULL,
  "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "action" "AutoModAction" NOT NULL DEFAULT 'BAN',
  "thresholdSeconds" INTEGER,
  "timeoutDurationSeconds" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AutoModRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AutoModLog" (
  "id" SERIAL NOT NULL,
  "guildId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "username" TEXT NOT NULL,
  "ruleId" INTEGER NOT NULL,
  "actionTaken" "AutoModActionTaken" NOT NULL,
  "reason" TEXT NOT NULL,
  "status" "AutoModLogStatus" NOT NULL DEFAULT 'PENDING',
  "dedupeKey" TEXT NOT NULL,
  "failureReason" TEXT,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AutoModLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AutoModRule_guildId_ruleType_key" ON "AutoModRule"("guildId", "ruleType");

CREATE INDEX "AutoModRule_guildId_idx" ON "AutoModRule"("guildId");

CREATE INDEX "AutoModRule_guildId_isEnabled_idx" ON "AutoModRule"("guildId", "isEnabled");

CREATE INDEX "AutoModLog_guildId_createdAt_idx" ON "AutoModLog"("guildId", "createdAt");

CREATE INDEX "AutoModLog_guildId_userId_createdAt_idx" ON "AutoModLog"(
  "guildId",
  "userId",
  "createdAt"
);

CREATE INDEX "AutoModLog_ruleId_idx" ON "AutoModLog"("ruleId");

CREATE UNIQUE INDEX "AutoModLog_dedupeKey_key" ON "AutoModLog"("dedupeKey");

ALTER TABLE "AutoModLog"
ADD CONSTRAINT "AutoModLog_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "AutoModRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
