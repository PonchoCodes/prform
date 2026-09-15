import { describe, it, expect } from "vitest";
import {
  resolveEntitlement,
  hasSeatForJoin,
  purchaseBlockedReason,
  shouldPromotePilotToPaid,
  FREE_SEAT_LIMIT,
  TEAM_SEAT_LIMIT,
  PROGRAM_SEAT_LIMIT,
  type TeamForEntitlement,
} from "@/lib/entitlements";

const NOW = new Date("2026-08-12T12:00:00Z");

function team(over: Partial<TeamForEntitlement> = {}): TeamForEntitlement {
  return {
    entitlementSource: "FREE",
    entitlementExpiresAt: null,
    seatLimit: FREE_SEAT_LIMIT,
    subscriptionStatus: null,
    ...over,
  };
}

describe("resolveEntitlement: FREE", () => {
  it("gives the leaderboard and the aggregate, and nothing else", () => {
    const e = resolveEntitlement(team(), NOW);
    expect(e.source).toBe("FREE");
    expect(e.active).toBe(true);
    expect(e.seatLimit).toBe(FREE_SEAT_LIMIT);
    expect(e.features).toEqual({
      leaderboard: true,
      teamAggregate: true,
      perAthleteStats: false,
      trends: false,
      meetReport: false,
      export: false,
    });
  });

  it("treats an unrecognized source as FREE rather than as permission", () => {
    const e = resolveEntitlement(team({ entitlementSource: "ENTERPRISE" }), NOW);
    expect(e.source).toBe("FREE");
    expect(e.features.perAthleteStats).toBe(false);
    expect(e.seatLimit).toBe(FREE_SEAT_LIMIT);
  });
});

describe("resolveEntitlement: PILOT", () => {
  const live = team({
    entitlementSource: "PILOT",
    entitlementExpiresAt: new Date("2027-07-31T23:59:59Z"),
    seatLimit: TEAM_SEAT_LIMIT,
  });

  it("unlocks everything at 40 seats while the pilot is live", () => {
    const e = resolveEntitlement(live, NOW);
    expect(e.active).toBe(true);
    expect(e.seatLimit).toBe(TEAM_SEAT_LIMIT);
    expect(Object.values(e.features).every(Boolean)).toBe(true);
  });

  it("falls to free features and 8 seats once it expires", () => {
    const e = resolveEntitlement(live, new Date("2027-08-01T00:00:01Z"));
    // The source still reads PILOT so a surface can say it ended, but nothing
    // is unlocked by it.
    expect(e.source).toBe("PILOT");
    expect(e.active).toBe(false);
    expect(e.seatLimit).toBe(FREE_SEAT_LIMIT);
    expect(e.features.perAthleteStats).toBe(false);
    expect(e.features.leaderboard).toBe(true);
  });

  it("is inactive when no expiry was ever recorded", () => {
    const e = resolveEntitlement(team({ entitlementSource: "PILOT" }), NOW);
    expect(e.active).toBe(false);
    expect(e.seatLimit).toBe(FREE_SEAT_LIMIT);
  });
});

describe("resolveEntitlement: PAID", () => {
  it("is live on active and on trialing", () => {
    for (const status of ["active", "trialing"]) {
      const e = resolveEntitlement(
        team({ entitlementSource: "PAID", subscriptionStatus: status, seatLimit: TEAM_SEAT_LIMIT }),
        NOW,
      );
      expect(e.active, status).toBe(true);
      expect(e.features.meetReport, status).toBe(true);
    }
  });

  it("lapses on any other status, keeping free features at 8 seats", () => {
    for (const status of ["past_due", "canceled", "unpaid", "incomplete", null]) {
      const e = resolveEntitlement(
        team({ entitlementSource: "PAID", subscriptionStatus: status, seatLimit: PROGRAM_SEAT_LIMIT }),
        NOW,
      );
      expect(e.active, String(status)).toBe(false);
      expect(e.seatLimit, String(status)).toBe(FREE_SEAT_LIMIT);
      expect(e.features.export, String(status)).toBe(false);
    }
  });

  it("reads the seat count from the tier bought, and clamps an unknown one down", () => {
    const program = resolveEntitlement(
      team({ entitlementSource: "PAID", subscriptionStatus: "active", seatLimit: PROGRAM_SEAT_LIMIT }),
      NOW,
    );
    expect(program.seatLimit).toBe(PROGRAM_SEAT_LIMIT);

    const tampered = resolveEntitlement(
      team({ entitlementSource: "PAID", subscriptionStatus: "active", seatLimit: 10000 }),
      NOW,
    );
    expect(tampered.seatLimit).toBe(TEAM_SEAT_LIMIT);
  });
});

describe("hasSeatForJoin", () => {
  it("refuses the athlete past the limit", () => {
    expect(hasSeatForJoin(7, 8, false)).toBe(true);
    expect(hasSeatForJoin(8, 8, false)).toBe(false);
  });

  it("never refuses someone already on the roster", () => {
    // A team that lapsed to 8 seats with 30 members: every one of those 30 can
    // still re-consent, and none of them is removed by anything.
    expect(hasSeatForJoin(30, 8, true)).toBe(true);
  });
});

describe("purchaseBlockedReason: one plan per team", () => {
  it("lets a FREE team with no subscription redeem a code or open checkout", () => {
    expect(purchaseBlockedReason({ entitlementSource: "FREE", stripeSubscriptionId: null })).toBeNull();
  });

  it("refuses a PAID team redeeming a pilot code", () => {
    expect(
      purchaseBlockedReason({ entitlementSource: "PAID", stripeSubscriptionId: "sub_paid" }),
    ).toBe("has_subscription");
    // Even before the webhook has recorded the subscription id.
    expect(purchaseBlockedReason({ entitlementSource: "PAID", stripeSubscriptionId: null })).toBe(
      "has_plan",
    );
  });

  it("refuses a PILOT team opening a list-price checkout", () => {
    expect(
      purchaseBlockedReason({ entitlementSource: "PILOT", stripeSubscriptionId: "sub_pilot" }),
    ).toBe("has_subscription");
    // A pilot that bounced off Stripe and has no card yet is still on a plan.
    expect(purchaseBlockedReason({ entitlementSource: "PILOT", stripeSubscriptionId: null })).toBe(
      "has_plan",
    );
  });

  it("refuses a FREE-labelled team that somehow still holds a subscription", () => {
    expect(
      purchaseBlockedReason({ entitlementSource: "FREE", stripeSubscriptionId: "sub_stale" }),
    ).toBe("has_subscription");
  });
});

describe("shouldPromotePilotToPaid: the webhook's promotion branch", () => {
  const past = Math.floor(NOW.getTime() / 1000) - 60;
  const future = Math.floor(NOW.getTime() / 1000) + 60;

  it("promotes a PILOT team once its trial is over and the subscription is active", () => {
    expect(shouldPromotePilotToPaid("PILOT", { status: "active", trial_end: past }, NOW)).toBe(true);
    expect(shouldPromotePilotToPaid("PILOT", { status: "active", trial_end: null }, NOW)).toBe(true);
  });

  it("does not promote a PILOT team still in its trial, or not active", () => {
    expect(shouldPromotePilotToPaid("PILOT", { status: "active", trial_end: future }, NOW)).toBe(false);
    expect(shouldPromotePilotToPaid("PILOT", { status: "trialing", trial_end: past }, NOW)).toBe(false);
    expect(shouldPromotePilotToPaid("PILOT", { status: "past_due", trial_end: null }, NOW)).toBe(false);
  });

  it("never fires for a PAID team, whose trial_end is null on every updated event", () => {
    expect(shouldPromotePilotToPaid("PAID", { status: "active", trial_end: null }, NOW)).toBe(false);
  });

  it("never fires for a FREE team", () => {
    expect(shouldPromotePilotToPaid("FREE", { status: "active", trial_end: null }, NOW)).toBe(false);
  });
});
