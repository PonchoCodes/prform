-- Email as a third message channel.
--
-- Two enum values, added rather than replaced, so every existing SentMessage
-- row keeps its meaning. `ADD VALUE` cannot run inside a transaction block in
-- older Postgres, which is why these are two bare statements.
--
-- NOT applied to Neon by the session that wrote it. Apply with:
--   npx prisma db execute --file prisma/migrations/20260807050000_add_email_channel/migration.sql
--   npx prisma migrate resolve --applied 20260807050000_add_email_channel

ALTER TYPE "MessageChannel" ADD VALUE IF NOT EXISTS 'EMAIL';

ALTER TYPE "ChannelPreference" ADD VALUE IF NOT EXISTS 'EMAIL';
