-- CreateTable
CREATE TABLE "VoiceNotifyConfig" (
    "id" SERIAL NOT NULL,
    "guildId" TEXT NOT NULL,
    "voiceChannelId" TEXT NOT NULL,
    "notifyChannelId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VoiceNotifyConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VoiceNotifyConfig_guildId_idx" ON "VoiceNotifyConfig"("guildId");

-- CreateIndex
CREATE INDEX "VoiceNotifyConfig_notifyChannelId_idx" ON "VoiceNotifyConfig"("notifyChannelId");

-- CreateIndex
CREATE UNIQUE INDEX "VoiceNotifyConfig_guildId_voiceChannelId_key" ON "VoiceNotifyConfig"("guildId", "voiceChannelId");
