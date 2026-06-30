CREATE TABLE "AutoReactionConfig" (
  "channelId" TEXT NOT NULL,
  "guildId" TEXT NOT NULL,
  "emojis" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AutoReactionConfig_pkey" PRIMARY KEY ("channelId")
);

CREATE INDEX "AutoReactionConfig_guildId_idx" ON "AutoReactionConfig"("guildId");
