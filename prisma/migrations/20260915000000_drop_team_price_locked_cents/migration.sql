-- The locked pilot price lives in TIERS (lib/teamBilling.ts) and in the Stripe
-- price behind STRIPE_PRICE_TEAM_LOCKED. Storing a copy per team was a third
-- source that could disagree with both, so the column goes. It was nullable and
-- read only by the renewal notice, which now derives the amount from TIERS.

ALTER TABLE "Team" DROP COLUMN "priceLockedCents";
