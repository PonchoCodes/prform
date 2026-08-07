-- Team.coachId becomes Team.ownerId.
--
-- RENAME rather than drop-and-add, and that distinction is the whole point of
-- writing this by hand: `prisma migrate dev` generates a DROP COLUMN followed by
-- an ADD COLUMN for a rename it cannot recognise, which would detach every
-- existing team from its owner and then fail on the NOT NULL. A rename keeps
-- every row, every value and every permission exactly as it was.
--
-- The constraint and index are renamed too. Postgres does not care what they are
-- called, but Prisma compares by name — leaving them as "Team_coachId_fkey"
-- would make every future `migrate status` report drift against a schema that is
-- actually correct.
--
-- NOT applied to Neon by the session that wrote it. Apply with:
--   npx prisma db execute --file prisma/migrations/20260807000000_rename_coach_to_owner/migration.sql
--   npx prisma migrate resolve --applied 20260807000000_rename_coach_to_owner

ALTER TABLE "Team" RENAME COLUMN "coachId" TO "ownerId";

ALTER TABLE "Team" RENAME CONSTRAINT "Team_coachId_fkey" TO "Team_ownerId_fkey";

ALTER INDEX "Team_coachId_idx" RENAME TO "Team_ownerId_idx";
