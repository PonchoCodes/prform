-- When onboarding was completed, as a timestamp rather than a flag.
--
-- The backfill is an approximation and is deliberately one that cannot invent a
-- delay: existing completed accounts get their own createdAt, so they appear to
-- have finished onboarding the moment they signed up. That understates the gap
-- between the two funnel steps for pre-existing users and never overstates it.
-- The retention page labels those cohorts rather than silently mixing them in.
--
-- NOT applied to Neon by the session that wrote it. Apply with:
--   npx prisma db execute --file prisma/migrations/20260807040000_add_onboarding_completed_at/migration.sql
--   npx prisma migrate resolve --applied 20260807040000_add_onboarding_completed_at

ALTER TABLE "User" ADD COLUMN "onboardingCompletedAt" TIMESTAMP(3);

UPDATE "User" SET "onboardingCompletedAt" = "createdAt" WHERE "onboardingDone" = true;
