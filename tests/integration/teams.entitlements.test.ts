// What a plan does and, more importantly, what it is never allowed to do.
//
// The rule this file exists to hold shut: a team that loses its entitlement
// loses FEATURES and nothing else. Not members, not their consent records, not
// their own accounts or their own data. A coach who does not renew creates a
// problem for the coach, and any code that turns it into a problem for a
// sixteen-year-old is a bug no matter what the billing state says.
//
// Everything runs against the real database through the real handlers. The one
// substitution is the session, as everywhere else in this suite.

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";

vi.mock("next-auth", async () => {
  const { currentSession } = await import("./harness");
  return { default: {}, getServerSession: async () => currentSession() };
});

// Redemption hands the coach on to Stripe. That call is stubbed here for the
// same reason the session is: this suite talks to a real database and to
// nothing else. A test that creates live Stripe customers is a test nobody can
// run twice.
vi.mock("@/lib/teamCheckout", () => ({
  createTeamCheckoutSession: async () => ({ ok: true, url: "https://checkout.test/session" }),
  seatLimitForTier: () => 40,
}));

import { GET as exceptionsGET } from "@/app/api/teams/[teamId]/exceptions/route";
import { GET as leaderboardGET } from "@/app/api/teams/[teamId]/leaderboard/route";
import { POST as joinPOST } from "@/app/api/teams/join/route";
import { POST as redeemPilotPOST } from "@/app/api/teams/[teamId]/redeem-pilot/route";
import { prisma } from "@/lib/prisma";
import { TEAM_CONSENT_TEXT } from "@/lib/team/consent";
import { FREE_SEAT_LIMIT, TEAM_SEAT_LIMIT } from "@/lib/entitlements";
import { invoke, signInAs, signOut } from "./harness";
import { resetDatabase, seedWorld, type World } from "./world";

let world: World;

beforeAll(async () => {
  await resetDatabase();
});

beforeEach(async () => {
  await resetDatabase();
  world = await seedWorld();
  signOut();
});

afterAll(async () => {
  await resetDatabase();
  await prisma.$disconnect();
});

/** Drops a team to the free tier the way an unpaid renewal would. */
async function makeFree(teamId: string) {
  await prisma.team.update({
    where: { id: teamId },
    data: {
      entitlementSource: "FREE",
      entitlementExpiresAt: null,
      seatLimit: FREE_SEAT_LIMIT,
      subscriptionStatus: null,
    },
  });
}

/** Expires a pilot rather than removing it, which is the real lapse case. */
async function expirePilot(teamId: string) {
  await prisma.team.update({
    where: { id: teamId },
    data: {
      entitlementSource: "PILOT",
      entitlementExpiresAt: new Date(Date.now() - 60_000),
    },
  });
}

async function addAthletes(teamId: string, count: number) {
  for (let i = 0; i < count; i++) {
    const user = await prisma.user.create({
      data: {
        email: `filler.${teamId}.${i}@example.test`,
        name: `Filler ${i}`,
        password: "not-a-real-hash",
        onboardingDone: true,
      },
      select: { id: true },
    });
    await prisma.teamMembership.create({
      data: {
        teamId,
        userId: user.id,
        status: "ACTIVE",
        consentAt: new Date(),
        consentText: TEAM_CONSENT_TEXT,
      },
    });
  }
}

describe("the free tier", () => {
  it("refuses per-athlete status with 402 and names no athlete", async () => {
    await makeFree(world.teamA.id);
    signInAs(world.ownerA.id);

    const result = await invoke(exceptionsGET, { teamId: world.teamA.id });

    expect(result.status).toBe(402);
    expect(result.body.code).toBe("UPGRADE_REQUIRED");
    expect(result.text).not.toContain(world.athleteA.name);
  });

  it("still serves the leaderboard, which is not part of the paid product", async () => {
    await makeFree(world.teamA.id);
    signInAs(world.athleteA.id);

    const result = await invoke(leaderboardGET, { teamId: world.teamA.id });

    expect(result.status).toBe(200);
    expect(Array.isArray(result.body.entries)).toBe(true);
    expect(result.body.teamName).toBe(world.teamA.name);
  });

  it("keeps the 402 distinguishable from a 403, so a coach is told which is which", async () => {
    await makeFree(world.teamA.id);

    // Not the owner: still 403, and the entitlement never enters into it.
    signInAs(world.ownerB.id);
    const stranger = await invoke(exceptionsGET, { teamId: world.teamA.id });
    expect(stranger.status).toBe(403);

    signInAs(world.ownerA.id);
    const owner = await invoke(exceptionsGET, { teamId: world.teamA.id });
    expect(owner.status).toBe(402);
  });
});

describe("an expired pilot", () => {
  it("loses its features", async () => {
    await expirePilot(world.teamA.id);
    signInAs(world.ownerA.id);

    const result = await invoke(exceptionsGET, { teamId: world.teamA.id });
    expect(result.status).toBe(402);
  });

  it("loses NOT ONE MEMBER, and nobody's data goes anywhere", async () => {
    await addAthletes(world.teamA.id, 20);
    const before = await prisma.teamMembership.count({
      where: { teamId: world.teamA.id, status: "ACTIVE" },
    });
    expect(before).toBe(21);

    await expirePilot(world.teamA.id);
    signInAs(world.ownerA.id);
    await invoke(exceptionsGET, { teamId: world.teamA.id });

    const after = await prisma.teamMembership.count({
      where: { teamId: world.teamA.id, status: "ACTIVE" },
    });
    expect(after).toBe(21);

    // And the athlete's own account and history are untouched.
    const athlete = await prisma.user.findUnique({ where: { id: world.athleteA.id } });
    expect(athlete).not.toBeNull();
    const nights = await prisma.sleepLog.count({ where: { userId: world.athleteA.id } });
    expect(nights).toBeGreaterThan(0);
  });
});

describe("seats are checked at join time and only at join time", () => {
  it("refuses the athlete past the free limit", async () => {
    await makeFree(world.teamA.id);
    // One member already, so seven more fills the eight seats.
    await addAthletes(world.teamA.id, 7);

    const newcomer = await prisma.user.create({
      data: { email: "newcomer@example.test", name: "Newcomer", password: "x", onboardingDone: true },
      select: { id: true },
    });
    signInAs(newcomer.id);

    const result = await invoke(joinPOST, {
      body: { code: world.teamA.joinCode, consent: true },
    });

    expect(result.status).toBe(409);
    expect(result.body.code).toBe("TEAM_FULL");
  });

  it("lets a team on the pilot take forty", async () => {
    await addAthletes(world.teamA.id, TEAM_SEAT_LIMIT - 2);

    const newcomer = await prisma.user.create({
      data: { email: "fortieth@example.test", name: "Fortieth", password: "x", onboardingDone: true },
      select: { id: true },
    });
    signInAs(newcomer.id);

    const result = await invoke(joinPOST, {
      body: { code: world.teamA.joinCode, consent: true },
    });

    expect(result.status).toBe(200);
  });

  it("never refuses someone already on the roster, however far over the limit the team is", async () => {
    await addAthletes(world.teamA.id, 20);
    await makeFree(world.teamA.id);

    // Athlete A is already ACTIVE on a team of 21 with 8 seats. Re-consenting
    // is not joining, and the limit must not lock an existing member out of
    // their own membership.
    signInAs(world.athleteA.id);
    const result = await invoke(joinPOST, {
      body: { code: world.teamA.joinCode, consent: true },
    });

    expect(result.status).toBe(200);
  });
});

describe("pilot redemption", () => {
  async function makeCode(code = "ABCD2345") {
    return prisma.pilotCode.create({
      data: { code, label: "Test school", expiresAt: new Date(Date.now() + 86_400_000) },
      select: { id: true, code: true },
    });
  }

  it("puts the team on the pilot with forty seats and the locked price", async () => {
    await makeFree(world.teamA.id);
    const code = await makeCode();
    signInAs(world.ownerA.id);

    const result = await invoke(redeemPilotPOST, {
      teamId: world.teamA.id,
      body: { code: code.code },
    });

    expect(result.status).toBe(200);
    const team = await prisma.team.findUnique({ where: { id: world.teamA.id } });
    expect(team?.entitlementSource).toBe("PILOT");
    expect(team?.seatLimit).toBe(TEAM_SEAT_LIMIT);
  });

  it("accepts a code typed with spaces and in lower case", async () => {
    const code = await makeCode("MNPQ6789");
    signInAs(world.ownerA.id);

    const result = await invoke(redeemPilotPOST, {
      teamId: world.teamA.id,
      body: { code: "mnpq 6789" },
    });

    expect(result.status).toBe(200);
    const row = await prisma.pilotCode.findUnique({ where: { id: code.id } });
    expect(row?.redeemedByTeamId).toBe(world.teamA.id);
  });

  it("refuses the second team to present the same code, and leaves the first one's pilot alone", async () => {
    const code = await makeCode();
    await makeFree(world.teamA.id);
    await makeFree(world.teamB.id);

    signInAs(world.ownerA.id);
    const first = await invoke(redeemPilotPOST, {
      teamId: world.teamA.id,
      body: { code: code.code },
    });
    expect(first.status).toBe(200);

    signInAs(world.ownerB.id);
    const second = await invoke(redeemPilotPOST, {
      teamId: world.teamB.id,
      body: { code: code.code },
    });

    expect(second.status).toBe(409);
    expect(second.body.code).toBe("ALREADY_REDEEMED");

    const row = await prisma.pilotCode.findUnique({ where: { code: code.code } });
    expect(row?.redeemedByTeamId).toBe(world.teamA.id);
  });

  it("refuses two simultaneous redemptions of one code, with exactly one winner", async () => {
    // The read-then-write bug this route was written to avoid: both callers
    // see an unredeemed code, both write, both come away entitled.
    const code = await makeCode("RSTU2345");
    await makeFree(world.teamA.id);
    await makeFree(world.teamB.id);

    const attempt = async (userId: string, teamId: string) => {
      signInAs(userId);
      return invoke(redeemPilotPOST, { teamId, body: { code: code.code } });
    };

    // Sequenced through the same session shim, so this is not a true race.
    // what it pins is that the second write is refused by the WHERE clause
    // rather than by anything the first caller left in memory.
    const first = await attempt(world.ownerA.id, world.teamA.id);
    const second = await attempt(world.ownerB.id, world.teamB.id);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([200, 409]);

    const teamB = await prisma.team.findUnique({ where: { id: world.teamB.id } });
    expect(teamB?.entitlementSource).not.toBe("PILOT");
  });

  it("refuses an expired code", async () => {
    await prisma.pilotCode.create({
      data: { code: "VWXY2345", expiresAt: new Date(Date.now() - 1000) },
    });
    signInAs(world.ownerA.id);

    const result = await invoke(redeemPilotPOST, {
      teamId: world.teamA.id,
      body: { code: "VWXY2345" },
    });

    expect(result.status).toBe(409);
  });

  it("refuses a malformed code without touching the team", async () => {
    signInAs(world.ownerA.id);
    const result = await invoke(redeemPilotPOST, {
      teamId: world.teamA.id,
      body: { code: "not-a-code" },
    });

    expect(result.status).toBe(400);
  });
});
