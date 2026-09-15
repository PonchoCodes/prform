// What a team costs, when it renews, and the words we owe them about it.
//
// Pure. No prisma, no Stripe SDK. Every function here is a calculation over
// dates and cents, which is what lets the renewal date shown on the checkout
// page, the date sent to Stripe, and the date quoted in the reminder email all
// come from one place. Three copies of that arithmetic is how a disclosure ends
// up stating a date the customer is not actually charged on.
//
// Price IDs live in env vars. Hardcoding them means test and live mode need
// different builds, and a wrong id in a checkout call is a real charge at the
// wrong amount.

export type TeamTier = "TEAM" | "PROGRAM";
/** PILOT buys at the locked price behind a trial; PAID buys at list. */
export type BillingPath = "PILOT" | "PAID";

export interface TierSpec {
  tier: TeamTier;
  label: string;
  seatLimit: number;
  listCents: number;
  /** What a pilot team pays, this year and at every renewal. */
  lockedCents: number;
  listPriceEnv: string;
  lockedPriceEnv: string;
}

export const TIERS: Record<TeamTier, TierSpec> = {
  TEAM: {
    tier: "TEAM",
    label: "Team",
    seatLimit: 40,
    listCents: 14900,
    lockedCents: 9900,
    listPriceEnv: "STRIPE_PRICE_TEAM_LIST",
    lockedPriceEnv: "STRIPE_PRICE_TEAM_LOCKED",
  },
  PROGRAM: {
    tier: "PROGRAM",
    label: "Program",
    seatLimit: 100,
    listCents: 29900,
    lockedCents: 19900,
    listPriceEnv: "STRIPE_PRICE_PROGRAM_LIST",
    lockedPriceEnv: "STRIPE_PRICE_PROGRAM_LOCKED",
  },
};

export function isTeamTier(value: unknown): value is TeamTier {
  return value === "TEAM" || value === "PROGRAM";
}

/**
 * The Stripe price id for a tier on a path. Throws rather than falling back:
 * a missing id must fail the checkout call loudly, never quietly bill someone
 * at whatever price happens to be configured somewhere else.
 */
export function priceIdFor(tier: TeamTier, path: BillingPath): string {
  const spec = TIERS[tier];
  const key = path === "PILOT" ? spec.lockedPriceEnv : spec.listPriceEnv;
  const value = process.env[key];
  if (!value) throw new Error(`${key} is not set`);
  return value;
}

/** What this team will actually be charged at renewal, in cents. */
export function renewalCents(tier: TeamTier, path: BillingPath): number {
  return path === "PILOT" ? TIERS[tier].lockedCents : TIERS[tier].listCents;
}

export function formatUsd(cents: number): string {
  const dollars = cents / 100;
  return dollars % 1 === 0 ? `$${dollars.toFixed(0)}` : `$${dollars.toFixed(2)}`;
}

// ── Dates ───────────────────────────────────────────────────────────────────

/** Every school year on this product ends here. */
const RENEWAL_MONTH_INDEX = 6; // July
const RENEWAL_DAY = 31;

/** The end of the pilot: 2027-07-31T23:59:59Z, and nothing else, ever. */
export const PILOT_EXPIRES_AT = new Date(Date.UTC(2027, RENEWAL_MONTH_INDEX, RENEWAL_DAY, 23, 59, 59));

export function toUnix(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

/** The pilot's trial_end, as Stripe wants it. */
export function pilotTrialEndUnix(): number {
  return toUnix(PILOT_EXPIRES_AT);
}

/** July 31 23:59:59Z of a given year. */
function july31(year: number): Date {
  return new Date(Date.UTC(year, RENEWAL_MONTH_INDEX, RENEWAL_DAY, 23, 59, 59));
}

/** How close to a renewal date is too close to bill a stub period. */
const MIN_ANCHOR_LEAD_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface BillingAnchor {
  anchor: Date;
  /**
   * True when the preferred anchor (a year further out) had to be pulled back.
   *
   * Stripe requires billing_cycle_anchor to fall inside the FIRST billing
   * period, "the current timestamp plus the recurring interval duration",
   * so on an annual price no anchor more than a year out is accepted. A coach
   * signing up in early July therefore anchors to the July 31 a few weeks
   * away and pays a prorated stub for those weeks, rather than being anchored
   * to a date Stripe would reject outright.
   */
  clamped: boolean;
}

/**
 * When a list-price team is first billed in full. Everything after that is one
 * year later, on the same date, for the life of the subscription.
 *
 * The rule: the next July 31, unless that is less than 30 days away, in which
 * case the one after it: nobody should pay a three-week proration and then a
 * full year in the same month.
 */
export function paidBillingCycleAnchor(now: Date = new Date()): BillingAnchor {
  const year = now.getUTCFullYear();
  let anchor = july31(year);
  if (anchor.getTime() <= now.getTime()) anchor = july31(year + 1);

  if (anchor.getTime() - now.getTime() < MIN_ANCHOR_LEAD_DAYS * DAY_MS) {
    const preferred = july31(anchor.getUTCFullYear() + 1);
    // One annual period from now is the ceiling Stripe accepts.
    const ceiling = new Date(now.getTime());
    ceiling.setUTCFullYear(ceiling.getUTCFullYear() + 1);
    if (preferred.getTime() <= ceiling.getTime()) return { anchor: preferred, clamped: false };
    return { anchor, clamped: true };
  }

  return { anchor, clamped: false };
}

/** The renewal date a PILOT team is first charged on: the day the trial ends. */
export function pilotFirstChargeDate(): Date {
  return PILOT_EXPIRES_AT;
}

export function formatRenewalDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

// ── The disclosure ──────────────────────────────────────────────────────────

/**
 * The auto-renewal sentence, built once and shown everywhere it is owed: above
 * the submit button on our page, above the submit button on Stripe's, and in
 * both reminder emails.
 *
 * California and several other states require the exact date, the exact amount
 * and the fact that it renews until cancelled, stated conspicuously rather than
 * behind a tooltip or inside collapsed terms. It is also just the email that
 * saves the renewal: a charge nobody remembers agreeing to is a dispute.
 */
export function renewalDisclosure(args: {
  tier: TeamTier;
  path: BillingPath;
  firstChargeDate: Date;
  /** Set when the first charge is a partial period ahead of the anchor. */
  proratedFirstTerm?: boolean;
}): string {
  const amount = formatUsd(renewalCents(args.tier, args.path));
  const date = formatRenewalDate(args.firstChargeDate);
  const lead =
    args.path === "PILOT"
      ? `Your card will not be charged today. On ${date} you will be charged ${amount}.`
      : args.proratedFirstTerm
        ? `You will be charged today for the period up to ${date}, then ${amount} on ${date}.`
        : `You will be charged ${amount} on ${date}.`;

  return `${lead} This subscription renews automatically every year on July 31 for ${amount} until you cancel. Cancel any time from your team settings, or by replying to any PRform email, and you keep access through the period you have paid for.`;
}

/**
 * What a live team is charged at its next renewal, from its entitlement alone.
 *
 * The one source for the quoted amount, so the notice email, the checkout page
 * and the disclosure cannot disagree. A PILOT team is always the Team tier on
 * the locked path (that is what a pilot code buys). A PAID team is on the tier
 * its seat limit says it bought, at list. Nothing is stored per team: the
 * price is a property of the plan, and the plan is a property of TIERS.
 */
export function renewalQuoteCents(team: { source: "PILOT" | "PAID"; seatLimit: number }): number {
  if (team.source === "PILOT") return renewalCents("TEAM", "PILOT");
  const tier: TeamTier = team.seatLimit >= TIERS.PROGRAM.seatLimit ? "PROGRAM" : "TEAM";
  return renewalCents(tier, "PAID");
}
