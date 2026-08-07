-- Web push: per-device subscriptions, a channel on every outbound message, and
-- the athlete's channel preference.
--
-- Ordering note: this ALTERs "SentMessage", which is created by
-- 20260805210000_add_sms_layer. That migration is still unapplied on Neon, so
-- these two must go on in order — `migrate deploy` does that, but a manual
-- apply must not skip ahead.
--
-- NOT applied to Neon by the session that wrote it. Apply with:
--   npx prisma db execute --file prisma/migrations/20260806220000_add_web_push/migration.sql
--   npx prisma migrate resolve --applied 20260806220000_add_web_push

CREATE TYPE "MessageChannel" AS ENUM ('SMS', 'PUSH');

CREATE TYPE "ChannelPreference" AS ENUM ('AUTO', 'SMS', 'PUSH');

ALTER TABLE "User"
    ADD COLUMN "channelPreference" "ChannelPreference" NOT NULL DEFAULT 'AUTO',
    ADD COLUMN "pushOptInAt" TIMESTAMP(3),
    ADD COLUMN "installPromptDismissedAt" TIMESTAMP(3);

-- Existing rows predate push and were all texts, which is exactly what the
-- default says. No backfill needed.
ALTER TABLE "SentMessage"
    ADD COLUMN "channel" "MessageChannel" NOT NULL DEFAULT 'SMS';

CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "platform" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSuccessAt" TIMESTAMP(3),
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "disabledAt" TIMESTAMP(3),

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

CREATE INDEX "PushSubscription_userId_disabledAt_idx" ON "PushSubscription"("userId", "disabledAt");

ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
