-- AlterTable
ALTER TABLE "User" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "stravaReminder1At" TIMESTAMP(3),
ADD COLUMN     "stravaReminder2At" TIMESTAMP(3);

-- Backfill approvedAt for users already approved before this column existed,
-- so the reminder cron has a baseline timestamp to measure the 48h / 5d
-- windows against. Uses updatedAt as the best available approximation.
UPDATE "User" SET "approvedAt" = "updatedAt" WHERE "approved" = true AND "approvedAt" IS NULL;
