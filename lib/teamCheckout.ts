// Stripe Checkout, created against a TEAM.
//
// The subscription id lands on Team, never on User, and that is the whole
// design: a coach may run a cross country team and a track team, and a single
// purchase must not quietly cover both. One Stripe customer per coach is fine
// and expected: customers are people, subscriptions are teams.
//
// Which is also why the webhook keys off the SUBSCRIPTION id rather than the
// customer id. Two teams under one customer would both match a customer-keyed
// update, and the second one would be entitled by the first one's money.
//
// ── Parameters verified against Stripe's current docs ───────────────────────
//
// payment_method_collection defaults to "always" and is set explicitly anyway,
// because the default is the thing that must not silently change under a card
// we are required to have on file: with a trial the amount due is 0, and
// "if_required" would collect nothing at all.
//
// trial_end and billing_cycle_anchor are mutually exclusive. "You can't use
// trials in Checkout Sessions with a billing cycle anchor", so the two paths
// below each use exactly one of them.
//
// billing_cycle_anchor "must be a future UNIX timestamp within the first
// billing period", which on an annual price means within one year. The anchor
// arithmetic and that ceiling live in lib/teamBilling.ts.
//
// proration_behavior defaults to create_prorations, which is what the paid
// path wants: the coach pays for the stub period up to July 31 and a full year
// after that.

import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import {
  paidBillingCycleAnchor,
  pilotFirstChargeDate,
  pilotTrialEndUnix,
  priceIdFor,
  renewalDisclosure,
  toUnix,
  TIERS,
  type BillingPath,
  type TeamTier,
} from "@/lib/teamBilling";

export interface TeamCheckoutArgs {
  teamId: string;
  ownerId: string;
  tier: TeamTier;
  path: BillingPath;
  /** Absolute origin, no trailing slash. */
  baseUrl: string;
}

export type TeamCheckoutResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

/**
 * Ensures a Stripe customer for the coach and returns its id.
 *
 * The team's own customer id wins when it has one, so a team that was already
 * billed keeps its billing identity even if the coach's user row was later
 * attached to a different customer.
 */
async function resolveCustomerId(args: {
  teamCustomerId: string | null;
  userCustomerId: string | null;
  userId: string;
  email: string;
  name: string | null;
  teamId: string;
}): Promise<string> {
  const existing = args.teamCustomerId ?? args.userCustomerId;
  if (existing) return existing;

  const customer = await stripe.customers.create({
    email: args.email,
    name: args.name ?? undefined,
    metadata: { userId: args.userId },
  });

  await prisma.user.update({
    where: { id: args.userId },
    data: { stripeCustomerId: customer.id },
  });

  return customer.id;
}

export async function createTeamCheckoutSession(args: TeamCheckoutArgs): Promise<TeamCheckoutResult> {
  if (!process.env.STRIPE_SECRET_KEY) return { ok: false, error: "Stripe is not configured" };

  const team = await prisma.team.findUnique({
    where: { id: args.teamId },
    select: { id: true, name: true, ownerId: true, stripeCustomerId: true },
  });
  if (!team || team.ownerId !== args.ownerId) return { ok: false, error: "Forbidden" };

  const owner = await prisma.user.findUnique({
    where: { id: args.ownerId },
    select: { email: true, name: true, stripeCustomerId: true },
  });
  if (!owner) return { ok: false, error: "Forbidden" };

  let price: string;
  try {
    price = priceIdFor(args.tier, args.path);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Price is not configured" };
  }

  const customerId = await resolveCustomerId({
    teamCustomerId: team.stripeCustomerId,
    userCustomerId: owner.stripeCustomerId,
    userId: args.ownerId,
    email: owner.email,
    name: owner.name,
    teamId: team.id,
  });

  const anchor = args.path === "PAID" ? paidBillingCycleAnchor() : null;
  const firstChargeDate = args.path === "PILOT" ? pilotFirstChargeDate() : anchor!.anchor;
  const disclosure = renewalDisclosure({
    tier: args.tier,
    path: args.path,
    firstChargeDate,
    proratedFirstTerm: args.path === "PAID",
  });

  // metadata carries the team on both objects. The session's copy is what the
  // completion event reads; the subscription's copy is what makes a
  // subscription traceable to its team from the Stripe dashboard alone.
  const metadata = { teamId: team.id, tier: args.tier, path: args.path };

  const subscriptionData =
    args.path === "PILOT"
      ? { trial_end: pilotTrialEndUnix(), metadata }
      : {
          billing_cycle_anchor: toUnix(anchor!.anchor),
          proration_behavior: "create_prorations" as const,
          metadata,
        };

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price, quantity: 1 }],
    // The card is required on both paths. A pilot without one is a team that
    // silently stops on the renewal date instead of renewing.
    payment_method_collection: "always",
    subscription_data: subscriptionData,
    // Stripe renders this directly above the submit button on the hosted page,
    // which is where the disclosure is legally required to be. Our own page
    // states the same sentence before the coach ever gets here.
    custom_text: { submit: { message: disclosure.slice(0, 1200) } },
    metadata,
    success_url: `${args.baseUrl}/team?checkout=success&team=${team.id}`,
    cancel_url: `${args.baseUrl}/team/billing?team=${team.id}&checkout=cancelled`,
  });

  if (!session.url) return { ok: false, error: "Stripe returned no checkout URL" };

  // The customer id is recorded on the team now rather than at completion, so
  // an abandoned checkout still leaves the team pointing at the right customer.
  await prisma.team.update({
    where: { id: team.id },
    data: { stripeCustomerId: customerId },
  });

  return { ok: true, url: session.url };
}

/** Seats the tier buys. Written to the team when a subscription goes live. */
export function seatLimitForTier(tier: TeamTier): number {
  return TIERS[tier].seatLimit;
}
