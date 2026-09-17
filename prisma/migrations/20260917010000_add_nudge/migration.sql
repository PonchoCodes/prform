-- AlterEnum
ALTER TYPE "MessageType" ADD VALUE 'COACH_NUDGE';

-- CreateTable
CREATE TABLE "Nudge" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "athleteUserId" TEXT NOT NULL,
    "channel" "MessageChannel" NOT NULL,
    "body" TEXT NOT NULL,
    "providerSid" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Nudge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Nudge_teamId_athleteUserId_createdAt_idx" ON "Nudge"("teamId", "athleteUserId", "createdAt");

-- AddForeignKey
ALTER TABLE "Nudge" ADD CONSTRAINT "Nudge_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

