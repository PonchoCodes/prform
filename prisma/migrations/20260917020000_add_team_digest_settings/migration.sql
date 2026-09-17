-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "digestEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "digestLastSentOn" TEXT,
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'America/New_York';

