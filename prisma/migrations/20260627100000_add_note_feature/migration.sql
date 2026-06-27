CREATE TYPE "NoteCategoryKind" AS ENUM ('ACTIVE', 'ARCHIVE');

CREATE TYPE "NoteChannelStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

CREATE TYPE "NoteVisibility" AS ENUM ('PUBLIC', 'PRIVATE');

CREATE TYPE "NoteCommentMode" AS ENUM ('OPEN', 'LOCKED');

CREATE TABLE "NoteConfig" (
  "guildId" TEXT NOT NULL,
  "lobbyChannelId" TEXT NOT NULL,
  "panelMessageId" TEXT,
  "categoryBaseName" VARCHAR(64) NOT NULL DEFAULT 'ノート',
  "archiveCategoryBaseName" VARCHAR(64) NOT NULL DEFAULT 'ノート Archive',
  "channelNamePrefix" VARCHAR(32) NOT NULL DEFAULT 'note',
  "creatorRoleId" TEXT,
  "managerRoleId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "NoteConfig_pkey" PRIMARY KEY ("guildId")
);

CREATE TABLE "NoteCategory" (
  "id" SERIAL NOT NULL,
  "guildId" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "kind" "NoteCategoryKind" NOT NULL,
  "sortOrder" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "NoteCategory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NoteChannel" (
  "id" SERIAL NOT NULL,
  "guildId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "status" "NoteChannelStatus" NOT NULL DEFAULT 'ACTIVE',
  "visibility" "NoteVisibility" NOT NULL DEFAULT 'PUBLIC',
  "commentMode" "NoteCommentMode" NOT NULL DEFAULT 'OPEN',
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "NoteChannel_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NoteCategory_guildId_categoryId_key" ON "NoteCategory"("guildId", "categoryId");

CREATE UNIQUE INDEX "NoteCategory_guildId_kind_sortOrder_key" ON "NoteCategory"("guildId", "kind", "sortOrder");

CREATE INDEX "NoteCategory_guildId_kind_idx" ON "NoteCategory"("guildId", "kind");

CREATE UNIQUE INDEX "NoteChannel_channelId_key" ON "NoteChannel"("channelId");

CREATE UNIQUE INDEX "NoteChannel_guildId_userId_key" ON "NoteChannel"("guildId", "userId");

CREATE INDEX "NoteChannel_guildId_status_idx" ON "NoteChannel"("guildId", "status");

CREATE INDEX "NoteChannel_guildId_categoryId_idx" ON "NoteChannel"("guildId", "categoryId");
