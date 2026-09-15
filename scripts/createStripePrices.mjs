// One-off: create the two team products and four annual prices in Stripe.
//
// Idempotent: reuses a product with the same name and a live yearly USD price
// with the same amount, so running it twice creates nothing new. Reads
// STRIPE_SECRET_KEY from .env and creates in whichever mode that key is
// (sk_live_ = live). Prints the four env vars to paste into Vercel.
//
//   node scripts/createStripePrices.mjs

import Stripe from "stripe";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
    }),
);

if (!env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY is not set in .env");
const stripe = new Stripe(env.STRIPE_SECRET_KEY);
console.error(`Mode: ${env.STRIPE_SECRET_KEY.startsWith("sk_live_") ? "LIVE" : "test"}`);

// Mirrors TIERS in lib/teamBilling.ts.
const spec = [
  { product: "PRform Team", key: "TEAM", list: 14900, locked: 9900, seats: 40 },
  { product: "PRform Program", key: "PROGRAM", list: 29900, locked: 19900, seats: 100 },
];

const out = {};
for (const s of spec) {
  const existing = (await stripe.products.search({ query: `name:'${s.product}'` })).data[0];
  const product =
    existing ??
    (await stripe.products.create({
      name: s.product,
      description: `Up to ${s.seats} athletes, billed yearly.`,
    }));

  const prices = (await stripe.prices.list({ product: product.id, active: true, limit: 20 })).data;
  const find = (amt) =>
    prices.find((p) => p.unit_amount === amt && p.recurring?.interval === "year" && p.currency === "usd");
  const mk = async (amt, nickname) =>
    find(amt) ??
    (await stripe.prices.create({
      product: product.id,
      unit_amount: amt,
      currency: "usd",
      recurring: { interval: "year" },
      nickname,
    }));

  out[`STRIPE_PRICE_${s.key}_LIST`] = (await mk(s.list, `${s.key} list`)).id;
  out[`STRIPE_PRICE_${s.key}_LOCKED`] = (await mk(s.locked, `${s.key} pilot-locked`)).id;
}

for (const [k, v] of Object.entries(out)) console.log(`${k}=${v}`);
