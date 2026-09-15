// What a team is entitled to, resolved in one place.
//
// Team.entitlementSource is a stored string and it is not the answer. An
// expired pilot still says PILOT; a subscription that lapsed in March still
// says PAID. The difference between what is stored and what is true is the
// entire reason this module exists, so **no route may read
// Team.entitlementSource directly**. It reads resolveTeamEntitlement.
//
// ── The rule that outranks every other rule here ────────────────────────────
//
// seatLimit is enforced at JOIN time and nowhere else. A team that lapses
// keeps every member it has. A 30-athlete team that drops to the free tier is
// a 30-athlete team that cannot take a 31st, not a team that loses 22 people.
// Athletes never lose their own account, their own data or their own history
// because a coach did not renew. The coach's lapse is the coach's problem,
// and any code that makes it a teenager's problem is a bug regardless of what
// the billing state says.
//
// The resolution itself is pure (resolveEntitlement) so it can be tested
// without a database; resolveTeamEntitlement is the prisma-backed wrapper.

import { prisma } from "@/lib/prisma";

export type EntitlementSource = "FREE" | "PILOT" | "PAID";

/** Free teams. Enough for a small squad, and the floor everything falls to. */
export const FREE_SEAT_LIMIT = 8;
/** Pilot teams, and the paid Team tier. */
export const TEAM_SEAT_LIMIT = 40;
/** The paid Program tier. */
export const PROGRAM_SEAT_LIMIT = 100;

/** Stripe subscription statuses that still entitle a team to its features. */
const LIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing"]);

export interface EntitlementFeatures {
  leaderboard: boolean;
  teamAggregate: boolean;
  perAthleteStats: boolean;
  trends: boolean;
  meetReport: boolean;
  export: boolean;
}

export interface TeamEntitlement {
  /** What the team is on. Reported as stored even when it has lapsed, so a
   *  surface can say "your pilot ended" rather than "you were never on one". */
  source: EntitlementSource;
  /** Whether that source is currently in effect. FREE is always active. */
  active: boolean;
  seatLimit: number;
  expiresAt: Date | null;
  features: EntitlementFeatures;
}

/** The two things a free team gets. Everything else is off. */
const FREE_FEATURES: EntitlementFeatures = {
  leaderboard: true,
  teamAggregate: true,
  perAthleteStats: false,
  trends: false,
  meetReport: false,
  export: false,
};

const ALL_FEATURES: EntitlementFeatures = {
  leaderboard: true,
  teamAggregate: true,
  perAthleteStats: true,
  trends: true,
  meetReport: true,
  export: true,
};

/** The fields resolveEntitlement needs. A subset of Team, so it stays pure. */
export interface TeamForEntitlement {
  entitlementSource: string;
  entitlementExpiresAt: Date | null;
  seatLimit: number;
  subscriptionStatus: string | null;
}

function normalizeSource(raw: string): EntitlementSource {
  return raw === "PILOT" || raw === "PAID" ? raw : "FREE";
}

/**
 * A paid team's seats come from the price tier it bought, which the checkout
 * and webhook paths write to Team.seatLimit. Anything that is not a tier we
 * sell resolves to the smaller one: a corrupt or hand-edited number must not
 * be a way to buy 10,000 seats.
 */
function paidSeatLimit(stored: number): number {
  return stored === PROGRAM_SEAT_LIMIT ? PROGRAM_SEAT_LIMIT : TEAM_SEAT_LIMIT;
}

/** The whole decision, as a function of the row and the current time. */
export function resolveEntitlement(team: TeamForEntitlement, now: Date = new Date()): TeamEntitlement {
  const source = normalizeSource(team.entitlementSource);

  if (source === "PILOT") {
    const expiresAt = team.entitlementExpiresAt;
    const live = expiresAt !== null && expiresAt.getTime() > now.getTime();
    return {
      source,
      active: live,
      // An expired pilot falls to the free floor. It does not fall to zero,
      // and nothing anywhere removes the members it gathered while live.
      seatLimit: live ? TEAM_SEAT_LIMIT : FREE_SEAT_LIMIT,
      expiresAt,
      features: live ? ALL_FEATURES : FREE_FEATURES,
    };
  }

  if (source === "PAID") {
    const live = LIVE_SUBSCRIPTION_STATUSES.has(team.subscriptionStatus ?? "");
    return {
      source,
      active: live,
      seatLimit: live ? paidSeatLimit(team.seatLimit) : FREE_SEAT_LIMIT,
      // Expiry on a paid plan is Stripe's to state, not ours to cache.
      expiresAt: null,
      features: live ? ALL_FEATURES : FREE_FEATURES,
    };
  }

  return {
    source: "FREE",
    active: true,
    seatLimit: FREE_SEAT_LIMIT,
    expiresAt: null,
    features: FREE_FEATURES,
  };
}

/**
 * The single source of truth. Load the team, resolve what it is entitled to.
 *
 * A team id that does not exist resolves to FREE rather than throwing: every
 * caller has already established the caller's relationship to the team, and a
 * missing row is not a reason to hand out features.
 */
export async function resolveTeamEntitlement(teamId: string): Promise<TeamEntitlement> {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: {
      entitlementSource: true,
      entitlementExpiresAt: true,
      seatLimit: true,
      subscriptionStatus: true,
    },
  });

  if (!team) {
    return {
      source: "FREE",
      active: true,
      seatLimit: FREE_SEAT_LIMIT,
      expiresAt: null,
      features: FREE_FEATURES,
    };
  }

  return resolveEntitlement(team);
}

// ── Join-time seat enforcement ──────────────────────────────────────────────

/**
 * Whether one more athlete may join. The ONLY place a seat limit is allowed to
 * decide anything.
 *
 * `alreadyActive` exists because re-consenting is not joining: an athlete
 * already on the roster upserting their membership must never be refused by a
 * limit their own row is part of.
 */
export function hasSeatForJoin(
  activeMemberCount: number,
  seatLimit: number,
  alreadyActive: boolean,
): boolean {
  if (alreadyActive) return true;
  return activeMemberCount < seatLimit;
}

// ── The coach-side guard ────────────────────────────────────────────────────

/** One athlete, as a coach-side surface is allowed to see them named. */
export interface ConsentedAthlete {
  userId: string;
  name: string;
  consentAt: Date;
}

export type CoachAccess =
  | {
      ok: true;
      team: { id: string; name: string };
      entitlement: TeamEntitlement;
      /** ACTIVE members who accepted the consent screen, in join order. */
      athletes: ConsentedAthlete[];
    }
  | { ok: false; reason: "not_owner" }
  | { ok: false; reason: "needs_upgrade"; entitlement: TeamEntitlement };

/**
 * Owner check, then entitlement, then consent, composed in that order, and the
 * order is the point.
 *
 * Ownership first, so a stranger learns nothing about whether a team exists or
 * what it pays for. Entitlement second, so a lapsed team gets a clean upgrade
 * answer instead of an empty list that reads like "your athletes vanished".
 * Consent last, so the list an owner receives is exactly the set of people who
 * agreed to be on it. The filter is applied here rather than trusted to each
 * route, because a route that forgets it is a disclosure nobody notices.
 *
 * Returns the filtered athlete list, never a bare boolean: the caller needs the
 * roster it is entitled to, and handing back `true` would mean every caller
 * re-queries the memberships and re-applies the consent rule themselves.
 */
export async function assertCoachAccess(teamId: string, userId: string): Promise<CoachAccess> {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { id: true, name: true, ownerId: true },
  });

  // "No such team" and "not your team" are indistinguishable on purpose, the
  // same rule assertOwnerOf follows. Distinguishing them lets anyone probe
  // which team ids exist.
  if (!team || team.ownerId !== userId) return { ok: false, reason: "not_owner" };

  const entitlement = await resolveTeamEntitlement(teamId);
  if (!entitlement.features.perAthleteStats) {
    return { ok: false, reason: "needs_upgrade", entitlement };
  }

  const memberships = await prisma.teamMembership.findMany({
    where: { teamId, status: "ACTIVE" },
    select: { userId: true, consentAt: true, user: { select: { name: true } } },
    orderBy: { joinedAt: "asc" },
  });

  const athletes = memberships
    // consentAt is non-null in the schema, and this filter is still written
    // out: the rule is "nobody appears on a coach's screen without a recorded
    // consent", and it should hold at the point of use rather than depend on
    // a column constraint staying the way it is today.
    .filter((m) => m.consentAt != null)
    .map((m) => ({
      userId: m.userId,
      name: m.user.name ?? "Unnamed athlete",
      consentAt: m.consentAt,
    }));

  return { ok: true, team: { id: team.id, name: team.name }, entitlement, athletes };
}

// ── Can this team start a new plan? ─────────────────────────────────────────

/** The fields the purchase guard needs. */
export interface TeamForPurchase {
  entitlementSource: string;
  stripeSubscriptionId: string | null;
}

export type PurchaseBlock = "has_subscription" | "has_plan";

/**
 * Whether a team may redeem a pilot code or open a list-price checkout.
 *
 * Both entry points call this before anything is written or sent to Stripe.
 * A team that already holds a subscription, or is already on a PILOT or PAID
 * plan, must not start a second one: redeeming a code on a paid team would
 * re-label it PILOT and open a second checkout at the locked price, and a paid
 * checkout on a pilot team would leave it with two live subscriptions.
 *
 * Returns the reason it is blocked, or null when the team is FREE with no
 * subscription and may proceed.
 */
export function purchaseBlockedReason(team: TeamForPurchase): PurchaseBlock | null {
  if (team.stripeSubscriptionId) return "has_subscription";
  if (normalizeSource(team.entitlementSource) !== "FREE") return "has_plan";
  return null;
}

// ── Webhook: promoting a pilot that has started billing ─────────────────────

/**
 * Whether a customer.subscription.updated event should turn a PILOT team into
 * a PAID one.
 *
 * True only when the team is stored as PILOT, the subscription is active, and
 * its trial is over (trial_end null or in the past). A PAID team is never
 * touched: its trial_end is null from the start, and the source check is what
 * keeps this from firing on every metadata or status update Stripe sends.
 */
export function shouldPromotePilotToPaid(
  storedSource: string,
  subscription: { status: string; trial_end: number | null },
  now: Date = new Date(),
): boolean {
  if (normalizeSource(storedSource) !== "PILOT") return false;
  if (subscription.status !== "active") return false;
  const trialOver = subscription.trial_end === null || subscription.trial_end * 1000 <= now.getTime();
  return trialOver;
}
