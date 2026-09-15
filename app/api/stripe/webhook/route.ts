import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { seatLimitForTier } from "@/lib/teamCheckout";
import { isTeamTier } from "@/lib/teamBilling";
import { shouldPromotePilotToPaid } from "@/lib/entitlements";
import type Stripe from "stripe";

// Stripe's side of the team subscription.
//
// Every lookup here is by SUBSCRIPTION id, never by customer id. One coach is
// one Stripe customer and may run several teams, so a customer-keyed update
// would entitle every team that coach owns off a single purchase. The only
// exception is the completion event, which carries the team id in metadata
// because the subscription id is being recorded for the first time.
//
// The signature is verified before anything is read. An unverified webhook is
// an unauthenticated request that grants a year of the paid product.
//
// Athletes are not in this file at all. No athlete feature is behind a
// subscription any more, and User's billing columns are left where they are,
// unread and unwritten.

/** Statuses Stripe reports that we mirror onto the team, verbatim. */
function subscriptionIdFromInvoice(invoice: any): string | null {
  // The field moved into `parent.subscription_details` in recent API versions
  // and older payloads still arrive with it at the top level, so both shapes
  // are read rather than assumed.
  const direct = invoice?.subscription;
  if (typeof direct === "string") return direct;
  if (direct?.id) return direct.id as string;

  const nested = invoice?.parent?.subscription_details?.subscription;
  if (typeof nested === "string") return nested;
  if (nested?.id) return nested.id as string;

  return null;
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode !== "subscription" || !session.subscription) break;

      const teamId = session.metadata?.teamId;
      if (!teamId) break;

      const subscription = await stripe.subscriptions.retrieve(
        session.subscription as string
      );
      const tier = session.metadata?.tier;
      const path = session.metadata?.path;

      await prisma.team.update({
        where: { id: teamId },
        data: {
          stripeCustomerId: (session.customer as string) ?? undefined,
          stripeSubscriptionId: subscription.id,
          subscriptionStatus: subscription.status,
          // A pilot that just put a card on file is still a pilot: its source
          // and expiry were set at redemption and this event must not move
          // them, or the locked price and the pilot end date are lost.
          ...(path === "PAID" && isTeamTier(tier)
            ? { entitlementSource: "PAID", seatLimit: seatLimitForTier(tier) }
            : {}),
        },
      });
      break;
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;

      const team = await prisma.team.findFirst({
        where: { stripeSubscriptionId: subscription.id },
        select: { id: true, entitlementSource: true },
      });
      if (!team) break;

      // A pilot whose trial has run out and is now billing is a paid team. Left
      // as PILOT it would resolve to expired on the day its first real payment
      // succeeded, which is the one moment it must not.
      //
      // This branch only ever fires on the PILOT path. Stripe sends
      // customer.subscription.updated on creation and on every status or
      // metadata change, and a PAID team's trial_end is null from the start,
      // so "trial over" is trivially true for it on every event. The stored
      // source is the guard: shouldPromotePilotToPaid returns false for
      // anything that is not PILOT, and lib/entitlements.test.ts pins that.
      const promoteToPaid = shouldPromotePilotToPaid(team.entitlementSource, subscription);

      const tier = subscription.metadata?.tier;

      await prisma.team.update({
        where: { id: team.id },
        data: {
          subscriptionStatus: subscription.status,
          ...(promoteToPaid
            ? {
                entitlementSource: "PAID",
                entitlementExpiresAt: null,
                ...(isTeamTier(tier) ? { seatLimit: seatLimitForTier(tier) } : {}),
              }
            : {}),
        },
      });
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;

      // Back to free. Note what this does NOT do: it does not touch a single
      // membership. The team keeps every athlete it has, loses the paid
      // features, and cannot add anyone past the free limit until it renews.
      await prisma.team.updateMany({
        where: { stripeSubscriptionId: subscription.id },
        data: {
          stripeSubscriptionId: null,
          subscriptionStatus: "canceled",
          entitlementSource: "FREE",
          entitlementExpiresAt: null,
        },
      });
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = subscriptionIdFromInvoice(invoice);
      if (!subscriptionId) break;

      // Mirror the subscription's own status rather than inventing one: Stripe
      // decides whether a failed payment means past_due or unpaid, and it may
      // still be retrying.
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      await prisma.team.updateMany({
        where: { stripeSubscriptionId: subscriptionId },
        data: { subscriptionStatus: subscription.status },
      });
      break;
    }
  }

  return NextResponse.json({ received: true });
}
