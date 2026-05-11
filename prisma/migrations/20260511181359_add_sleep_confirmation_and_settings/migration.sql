-- AlterTable
ALTER TABLE "User" ADD COLUMN     "bedtimeAdjustmentMinutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "planAggressiveness" INTEGER NOT NULL DEFAULT 85;

-- CreateTable
CREATE TABLE "SleepLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "recommendedBedtime" TEXT NOT NULL,
    "hitTarget" BOOLEAN,
    "actualBedtime" TEXT,
    "actualWakeTime" TEXT,
    "actualSleepHours" DOUBLE PRECISION,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SleepLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SleepLog_userId_date_key" ON "SleepLog"("userId", "date");

-- AddForeignKey
ALTER TABLE "SleepLog" ADD CONSTRAINT "SleepLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
