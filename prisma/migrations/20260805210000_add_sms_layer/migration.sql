-- Adds the SMS layer: consent and contact details on User, real timestamps on
-- SleepLog, and the outbound/inbound message ledgers.
--
-- Every added column is nullable or carries a default, so existing rows are
-- untouched and existing writers keep working unchanged. The one conversion is
-- SleepLog.source, handled below.

-- CreateEnum
CREATE TYPE "SmsStatus" AS ENUM ('UNVERIFIED', 'ACTIVE', 'STOPPED');

-- CreateEnum
CREATE TYPE "SleepSource" AS ENUM ('TIMESTAMPED', 'RECALLED', 'INFERRED', 'MANUAL');

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('EVENING_WAKE_QUESTION', 'LIGHTS_OUT', 'BED_ACK', 'MORNING_VERDICT', 'CLARIFICATION', 'HELP_REPLY', 'STOP_ACK', 'VERIFICATION_CODE');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('DRY_RUN', 'SCHEDULED', 'SENT', 'DELIVERED', 'FAILED', 'CANCELED');

-- CreateEnum
CREATE TYPE "InboundIntent" AS ENUM ('STOP', 'HELP', 'BED', 'UP', 'WAKE_TIME', 'DURATION', 'UNPARSED');

-- AlterTable
-- smsStatus defaults to UNVERIFIED, which is the state in which no message may
-- be sent. Every pre-existing user therefore lands in the safe state without a
-- backfill.
ALTER TABLE "User" ADD COLUMN     "phoneNumber" TEXT,
ADD COLUMN     "phoneVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "ianaTimezone" TEXT,
ADD COLUMN     "smsOptInAt" TIMESTAMP(3),
ADD COLUMN     "smsOptInText" TEXT,
ADD COLUMN     "smsStatus" "SmsStatus" NOT NULL DEFAULT 'UNVERIFIED';

-- AlterTable
ALTER TABLE "SleepLog" ADD COLUMN     "sleepOnsetAt" TIMESTAMP(3),
ADD COLUMN     "wakeAt" TIMESTAMP(3),
ADD COLUMN     "declaredWakeAt" TIMESTAMP(3),
ADD COLUMN     "confidence" DOUBLE PRECISION,
ADD COLUMN     "needsReview" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "needsReviewNote" TEXT;

-- AlterTable
-- Convert SleepLog.source from TEXT to the SleepSource enum, in place.
--
-- Safe to do destructively because the column has exactly one value in every
-- row that has ever existed: all three writers (app/api/sleep-log/route.ts and
-- two in prisma/seed.ts) write the string literal "manual", and nothing reads
-- the column at all. The CASE is written out anyway so the mapping is explicit
-- rather than implied by UPPER(); the ELSE folds any unanticipated legacy value
-- to MANUAL, which is what a pre-SMS row is by definition.
ALTER TABLE "SleepLog" ALTER COLUMN "source" DROP DEFAULT;
ALTER TABLE "SleepLog" ALTER COLUMN "source" TYPE "SleepSource"
  USING (
    CASE UPPER("source")
      WHEN 'TIMESTAMPED' THEN 'TIMESTAMPED'
      WHEN 'RECALLED'    THEN 'RECALLED'
      WHEN 'INFERRED'    THEN 'INFERRED'
      ELSE 'MANUAL'
    END
  )::"SleepSource";
ALTER TABLE "SleepLog" ALTER COLUMN "source" SET DEFAULT 'MANUAL';

-- CreateTable
CREATE TABLE "SentMessage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "localDate" TEXT NOT NULL,
    "messageType" "MessageType" NOT NULL,
    "scheduledFor" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "providerMessageSid" TEXT,
    "status" "MessageStatus" NOT NULL,
    "body" TEXT NOT NULL,
    "sendCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SentMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InboundMessage" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "fromNumber" TEXT NOT NULL,
    "rawBody" TEXT NOT NULL,
    "intent" "InboundIntent" NOT NULL,
    "parsedValue" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "providerMessageSid" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InboundMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhoneVerification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PhoneVerification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- Nullable-unique: Postgres permits many NULLs, so users without SMS are
-- unaffected, while a verified number can belong to exactly one account.
CREATE UNIQUE INDEX "User_phoneNumber_key" ON "User"("phoneNumber");

-- CreateIndex
CREATE INDEX "SentMessage_providerMessageSid_idx" ON "SentMessage"("providerMessageSid");

-- CreateIndex
CREATE INDEX "SentMessage_status_scheduledFor_idx" ON "SentMessage"("status", "scheduledFor");

-- CreateIndex
CREATE UNIQUE INDEX "SentMessage_userId_localDate_messageType_key" ON "SentMessage"("userId", "localDate", "messageType");

-- CreateIndex
CREATE INDEX "InboundMessage_userId_receivedAt_idx" ON "InboundMessage"("userId", "receivedAt");

-- CreateIndex
CREATE INDEX "InboundMessage_providerMessageSid_idx" ON "InboundMessage"("providerMessageSid");

-- CreateIndex
CREATE INDEX "InboundMessage_intent_idx" ON "InboundMessage"("intent");

-- CreateIndex
CREATE INDEX "PhoneVerification_userId_createdAt_idx" ON "PhoneVerification"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "SentMessage" ADD CONSTRAINT "SentMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboundMessage" ADD CONSTRAINT "InboundMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhoneVerification" ADD CONSTRAINT "PhoneVerification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
