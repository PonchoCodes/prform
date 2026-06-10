-- CreateEnum
CREATE TYPE "WaitlistRole" AS ENUM ('RUNNER', 'COACH');

-- CreateEnum
CREATE TYPE "WaitlistStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "approved" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "earlyAccessUser" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Waitlist" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "WaitlistRole" NOT NULL,
    "weeklyMileage" INTEGER,
    "usesStrava" BOOLEAN NOT NULL,
    "notes" TEXT,
    "status" "WaitlistStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),

    CONSTRAINT "Waitlist_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Waitlist_email_key" ON "Waitlist"("email");
