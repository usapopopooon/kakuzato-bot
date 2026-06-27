ALTER TABLE "BumpReminder"
  ADD COLUMN "reminderDelayMinutes" INTEGER NOT NULL DEFAULT 120;

UPDATE "BumpReminder"
SET "reminderDelayMinutes" = 300
WHERE "serviceKey" = 'DISBOARD';

UPDATE "BumpReminder"
SET "reminderDelayMinutes" = 120
WHERE "serviceKey" = 'DISSOKU';
