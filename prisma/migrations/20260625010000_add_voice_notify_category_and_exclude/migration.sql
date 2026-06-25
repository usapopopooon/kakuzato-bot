-- CreateTable
CREATE TABLE "VoiceNotifyCategoryConfig" (
    "id" SERIAL NOT NULL,
    "guildId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "notifyChannelId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VoiceNotifyCategoryConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoiceNotifyExclude" (
    "id" SERIAL NOT NULL,
    "guildId" TEXT NOT NULL,
    "voiceChannelId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VoiceNotifyExclude_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VoiceNotifyCategoryConfig_guildId_idx" ON "VoiceNotifyCategoryConfig"("guildId");

-- CreateIndex
CREATE INDEX "VoiceNotifyCategoryConfig_notifyChannelId_idx" ON "VoiceNotifyCategoryConfig"("notifyChannelId");

-- CreateIndex
CREATE UNIQUE INDEX "VoiceNotifyCategoryConfig_guildId_categoryId_key" ON "VoiceNotifyCategoryConfig"("guildId", "categoryId");

-- CreateIndex
CREATE INDEX "VoiceNotifyExclude_guildId_idx" ON "VoiceNotifyExclude"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "VoiceNotifyExclude_guildId_voiceChannelId_key" ON "VoiceNotifyExclude"("guildId", "voiceChannelId");
