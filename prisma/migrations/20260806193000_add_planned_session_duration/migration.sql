-- Required duration on a coach's planned session.
--
-- NOT APPLIED. Apply with:
--   npx prisma db execute --file prisma/migrations/20260806193000_add_planned_session_duration/migration.sql
--   npx prisma migrate resolve --applied 20260806193000_add_planned_session_duration
--
-- NOT NULL with no default, deliberately. There is nothing to back-fill: at the
-- time this was written "PlannedSession" had been in production for minutes and
-- held zero rows, so no row can violate the constraint.
--
-- The absence of a default is the point. The merge layer previously gave every
-- team session a nominal 60 minutes, which fed a fabricated number into the
-- athlete's training-load bonus. A default here would move that same guess from
-- the code into the schema. If rows have appeared before this runs, this
-- statement fails loudly rather than stamping an invented duration onto a real
-- coach's session — fix it by having the coach supply the missing values, not
-- by adding a default.

ALTER TABLE "PlannedSession" ADD COLUMN "durationMinutes" INTEGER NOT NULL;
