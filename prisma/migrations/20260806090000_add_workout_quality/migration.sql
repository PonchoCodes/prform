-- Self-reported session quality on Workout. Additive and nullable: every
-- existing row means "never asked", and no backfill is possible or wanted.
--
-- NOT applied to Neon by the session that wrote it. Apply with:
--   npx prisma db execute --file prisma/migrations/20260806090000_add_workout_quality/migration.sql
--   npx prisma migrate resolve --applied 20260806090000_add_workout_quality

CREATE TYPE "WorkoutQuality" AS ENUM ('NAILED_IT', 'FINE', 'ROUGH');

ALTER TABLE "Workout" ADD COLUMN "quality" "WorkoutQuality";
