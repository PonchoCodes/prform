import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import type Stripe from "stripe";

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

      const subscription = await stripe.subscriptions.retrieve(
        session.subscription as string
      );
      const customerId = session.customer as string;

      await prisma.user.updateMany({
        where: { stripeCustomerId: customerId },
        data: {
          stripeSubscriptionId: subscription.id,
          subscriptionStatus: subscription.status,
          trialEndsAt: subscription.trial_end
            ? new Date(subscription.trial_end * 1000)
            : null,
        },
      });
      break;
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      await prisma.user.updateMany({
        where: { stripeCustomerId: subscription.customer as string },
        data: {
          stripeSubscriptionId: subscription.id,
          subscriptionStatus: subscription.status,
          trialEndsAt: subscription.trial_end
            ? new Date(subscription.trial_end * 1000)
            : null,
        },
      });
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      await prisma.user.updateMany({
        where: { stripeCustomerId: subscription.customer as string },
        data: {
          stripeSubscriptionId: null,
          subscriptionStatus: "canceled",
          trialEndsAt: null,
        },
      });
      break;
    }
  }

  return NextResponse.json({ received: true });
}
