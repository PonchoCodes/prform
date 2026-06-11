/*
  Warnings:

  - You are about to drop the column `stravaWebhookSubscriptionId` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "User" DROP COLUMN "stravaWebhookSubscriptionId",
ADD COLUMN     "lastStravaSyncAt" TIMESTAMP(3);
