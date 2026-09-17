-- CreateTable
CREATE TABLE "TeamMeet" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "distances" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamMeet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TeamMeet_teamId_date_idx" ON "TeamMeet"("teamId", "date");

-- AddForeignKey
ALTER TABLE "TeamMeet" ADD CONSTRAINT "TeamMeet_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

