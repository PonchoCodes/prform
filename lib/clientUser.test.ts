import { describe, it, expect } from "vitest";
import { toClientUser, CLIENT_USER_FIELDS, CLIENT_USER_SELECT } from "@/lib/clientUser";

/**
 * A complete User row as Prisma would return it with no `select` — the exact
 * shape that was previously being handed to the browser. Used to prove nothing
 * sensitive survives the narrowing.
 */
const FULL_USER_ROW = {
  id: "user_abc123",
  email: "runner@example.com",
  password: "$2a$12$abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG",
  name: "Test Runner",
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-08-01"),

  age: 27,
  biologicalSex: "female",
  weeklyMileage: "40-60",
  experienceLevel: "post_collegiate",
  onboardingDone: true,
  sport: "track",

  currentWakeTime: "06:00",
  currentBedTime: "22:00",
  restedFeeling: "ok",

  prDistanceId: "5k",
  prTimeSeconds: 1197,
  prRecency: "1_3m",
  prSetOn: new Date("2026-06-01"),
  goalRaceDistanceId: "10k",
  prPromptDismissedAt: null,

  notifPhase1: true,
  notifPhase2: true,
  notifPhase3: true,
  notifPhase4: true,

  stravaAccessToken: "a1b2c3d4e5f6_ACCESS_TOKEN",
  stravaRefreshToken: "r1e2f3r4e5s6h_REFRESH_TOKEN",
  stravaTokenExpiry: new Date("2026-09-01"),
  stravaAthleteId: "12345678",
  stravaConnected: true,
  lastStravaSyncAt: new Date("2026-08-04"),
  userMaxHR: 190,
  userThresholdHR: 169,

  planAggressiveness: 85,
  bedtimeAdjustmentMinutes: 0,
  unitPreference: "metric",

  stripeCustomerId: "cus_SECRET123",
  stripeSubscriptionId: "sub_SECRET456",
  subscriptionStatus: "trialing",
  trialEndsAt: new Date("2026-09-01"),

  approved: true,
  earlyAccessUser: true,
  approvedAt: new Date("2026-02-01"),
  stravaReminder1At: null,
  stravaReminder2At: null,
};

/** Values that must never appear anywhere in a client payload. */
const SECRET_VALUES = [
  FULL_USER_ROW.password,
  FULL_USER_ROW.stravaAccessToken,
  FULL_USER_ROW.stravaRefreshToken,
  FULL_USER_ROW.stripeCustomerId,
  FULL_USER_ROW.stripeSubscriptionId,
];

const FORBIDDEN_KEY_PATTERN = /password|token|secret|stripe|refresh|athleteId/i;

describe("toClientUser", () => {
  it("returns exactly the allowlisted fields — no more, no less", () => {
    const result = toClientUser(FULL_USER_ROW);
    expect(Object.keys(result).sort()).toEqual([...CLIENT_USER_FIELDS].sort());
  });

  it("drops the password hash", () => {
    expect(toClientUser(FULL_USER_ROW)).not.toHaveProperty("password");
  });

  it("drops Strava OAuth tokens", () => {
    const result = toClientUser(FULL_USER_ROW) as unknown as Record<string, unknown>;
    expect(result.stravaAccessToken).toBeUndefined();
    expect(result.stravaRefreshToken).toBeUndefined();
    expect(result.stravaTokenExpiry).toBeUndefined();
  });

  it("drops Stripe customer and subscription IDs", () => {
    const result = toClientUser(FULL_USER_ROW) as unknown as Record<string, unknown>;
    expect(result.stripeCustomerId).toBeUndefined();
    expect(result.stripeSubscriptionId).toBeUndefined();
  });

  it("drops email and other PII the dashboard does not read", () => {
    const result = toClientUser(FULL_USER_ROW) as unknown as Record<string, unknown>;
    for (const key of ["email", "name", "id", "approved", "userMaxHR", "restedFeeling"]) {
      expect(result[key]).toBeUndefined();
    }
  });

  it("has no key matching the forbidden pattern", () => {
    for (const key of Object.keys(toClientUser(FULL_USER_ROW))) {
      expect(key).not.toMatch(FORBIDDEN_KEY_PATTERN);
    }
  });

  it("leaks no secret value anywhere in the serialized payload", () => {
    // Serializing catches a secret smuggled in via a nested object, which a
    // key-by-key check would miss.
    const serialized = JSON.stringify(toClientUser(FULL_USER_ROW));
    for (const secret of SECRET_VALUES) {
      expect(serialized).not.toContain(secret);
    }
  });

  it("keeps the six fields the dashboard actually reads", () => {
    const result = toClientUser(FULL_USER_ROW);
    expect(result.prDistanceId).toBe("5k");
    expect(result.prPromptDismissedAt).toBeNull();
    expect(result.subscriptionStatus).toBe("trialing");
    expect(result.trialEndsAt).toEqual(FULL_USER_ROW.trialEndsAt);
    expect(result.earlyAccessUser).toBe(true);
    expect(result.unitPreference).toBe("metric");
  });

  it("defaults sensibly for a sparse row", () => {
    const result = toClientUser({});
    expect(result.prDistanceId).toBeNull();
    expect(result.earlyAccessUser).toBe(false);
    expect(result.unitPreference).toBe("imperial");
  });

  it("keeps CLIENT_USER_SELECT in step with the output shape", () => {
    // If someone adds a field to the select for server-side use, this fails
    // and forces a decision about whether it should reach the client.
    expect(Object.keys(CLIENT_USER_SELECT).sort()).toEqual([...CLIENT_USER_FIELDS].sort());
  });
});
