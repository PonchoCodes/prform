// One-off: set the PRform webhook endpoint's event list to exactly what
// app/api/stripe/webhook/route.ts handles. Same endpoint, so the signing
// secret in STRIPE_WEBHOOK_SECRET stays valid.
//
//   node scripts/fixStripeWebhookEvents.mjs

import Stripe from "stripe";
import { readFileSync } from "node:fs";

const key = readFileSync(".env", "utf8").match(/^STRIPE_SECRET_KEY=["']?([^"'\r\n]+)/m)?.[1];
if (!key) throw new Error("STRIPE_SECRET_KEY is not set in .env");
const stripe = new Stripe(key);

const ENDPOINT = "we_1TXlaEJx5NKy3zfuQIbE1TW9"; // https://prformm.vercel.app/api/stripe/webhook
const EVENTS = [
  "checkout.session.completed",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_failed",
];

const ep = await stripe.webhookEndpoints.update(ENDPOINT, { enabled_events: EVENTS });
console.log({ url: ep.url, status: ep.status, events: ep.enabled_events });
