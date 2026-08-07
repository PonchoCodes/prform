-- Streak holds: a stretch of days the athlete has marked as away.
--
-- NOT applied to Neon by the session that wrote it. Apply with:
--   npx prisma db execute --file prisma/migrations/20260807030000_add_streak_hold/migration.sql
--   npx prisma migrate resolve --applied 20260807030000_add_streak_hold

CREATE TABLE "StreakHold" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startsOn" TIMESTAMP(3) NOT NULL,
    "endsOn" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StreakHold_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StreakHold_userId_startsOn_idx" ON "StreakHold"("userId", "startsOn");

ALTER TABLE "StreakHold" ADD CONSTRAINT "StreakHold_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
