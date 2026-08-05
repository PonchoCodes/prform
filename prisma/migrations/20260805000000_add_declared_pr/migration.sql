-- AlterTable
-- All columns are nullable with no default: existing users are untouched and
-- fall through to history-inferred paces exactly as before.
ALTER TABLE "User" ADD COLUMN     "prDistanceId" TEXT,
ADD COLUMN     "prTimeSeconds" DOUBLE PRECISION,
ADD COLUMN     "prRecency" TEXT,
ADD COLUMN     "prSetOn" TIMESTAMP(3),
ADD COLUMN     "goalRaceDistanceId" TEXT,
ADD COLUMN     "prPromptDismissedAt" TIMESTAMP(3);
