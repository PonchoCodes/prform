-- AlterTable
ALTER TABLE "Workout" ADD COLUMN     "conflictDismissed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isTentative" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "manualOverride" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "stravaActivityId" TEXT;
