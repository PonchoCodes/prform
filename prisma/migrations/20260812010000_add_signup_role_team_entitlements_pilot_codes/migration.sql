-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "entitlementExpiresAt" TIMESTAMP(3),
ADD COLUMN     "entitlementSource" TEXT NOT NULL DEFAULT 'FREE',
ADD COLUMN     "seatLimit" INTEGER NOT NULL DEFAULT 8,
ADD COLUMN     "stripeCustomerId" TEXT,
ADD COLUMN     "stripeSubscriptionId" TEXT,
ADD COLUMN     "subscriptionStatus" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "ageConfirmed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ageConfirmedAt" TIMESTAMP(3),
ADD COLUMN     "signupRole" TEXT,
ADD COLUMN     "stravaEligible" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "stravaInterest" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "PilotCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT,
    "redeemedByTeamId" TEXT,
    "redeemedByUserId" TEXT,
    "redeemedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PilotCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PilotCode_code_key" ON "PilotCode"("code");

-- CreateIndex
CREATE UNIQUE INDEX "PilotCode_redeemedByTeamId_key" ON "PilotCode"("redeemedByTeamId");

-- AddForeignKey
ALTER TABLE "PilotCode" ADD CONSTRAINT "PilotCode_redeemedByTeamId_fkey" FOREIGN KEY ("redeemedByTeamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
