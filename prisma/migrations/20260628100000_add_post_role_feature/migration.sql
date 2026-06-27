CREATE TABLE "PostRoleConfig" (
  "channelId" TEXT NOT NULL,
  "guildId" TEXT NOT NULL,
  "roleId" TEXT NOT NULL,
  "historyLimit" INTEGER NOT NULL DEFAULT 500,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PostRoleConfig_pkey" PRIMARY KEY ("channelId")
);

CREATE INDEX "PostRoleConfig_guildId_idx" ON "PostRoleConfig"("guildId");
CREATE INDEX "PostRoleConfig_roleId_idx" ON "PostRoleConfig"("roleId");
