-- The triggered PWA install modal: whether it has been answered, when it was
-- last dismissed, and how many times it has been shown.
--
-- Deliberately separate from installPromptDismissedAt, which belongs to the
-- dashboard strip added with the web push layer. The two prompts ask for the
-- same thing but answer to different rules — the strip waits on a logged night
-- and stays dismissed forever, the modal re-asks after seven days up to three
-- times — and collapsing them onto one column would mean a "not now" on either
-- one silently spending the other.
--
-- pwaPromptState is a String, not an enum. Adding a value to a Postgres enum is
-- a migration and a client regeneration on every developer machine, and the set
-- of states this records is not settled yet.
--
-- No backfill. Null is the correct starting state for every existing row: it
-- means "never answered", which is exactly true of an account that predates the
-- modal.
--
-- NOT applied to Neon by the session that wrote it. Apply with:
--   npx prisma db execute --file prisma/migrations/20260812000000_add_pwa_prompt_state/migration.sql
--   npx prisma migrate resolve --applied 20260812000000_add_pwa_prompt_state

ALTER TABLE "User" ADD COLUMN "pwaPromptState" TEXT;
ALTER TABLE "User" ADD COLUMN "pwaPromptDismissedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "pwaPromptShowCount" INTEGER NOT NULL DEFAULT 0;
