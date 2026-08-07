// The privacy boundary, which matters as much as the authorization one.
//
// An owner is allowed to see their own roster. What they are never allowed to
// see is when an athlete slept. lib/team/consent.ts is the promise — "they
// CANNOT see my bedtimes, wake times, or hours slept" — and these tests hold
// the responses to it, for the owner's OWN team, where the guard is satisfied
// and nothing else stands between the athlete and the owner except the shape
// of the payload.
//
// Second half: join codes are secrets, so the API must not confirm which
// strings are live ones.

import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";

vi.mock("next-auth", async () => {
  const { currentSession } = await import("./harness");
  return { default: {}, getServerSession: async () => currentSession() };
});

import { GET as exceptionsGET } from "@/app/api/teams/[teamId]/exceptions/route";
import { GET as sessionsGET } from "@/app/api/teams/[teamId]/sessions/route";
import { GET as teamsGET } from "@/app/api/teams/route";
import { POST as joinPOST } from "@/app/api/teams/join/route";
import { prisma } from "@/lib/prisma";
import { invoke, signInAs, signOut } from "./harness";
import { resetDatabase, seedWorld, ATHLETE_A_SLEEP, type World } from "./world";
import { TEAM_CONSENT_TEXT } from "@/lib/team/consent";

let world: World;

beforeEach(async () => {
  await resetDatabase();
  world = await seedWorld();
  signOut();
});

afterAll(async () => {
  await resetDatabase();
  await prisma.$disconnect();
});

/** Every key appearing anywhere in a parsed body, at any depth. */
function allKeys(value: unknown, found: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) allKeys(item, found);
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      found.push(key);
      allKeys(child, found);
    }
  }
  return found;
}

/** A field name that would mean raw sleep data made it into the payload. */
const RAW_SLEEP_KEY = /bedtime|waketime|wake_?at|sleep|hours|hitTarget|onset|needsReview/i;

/** "23:52", "5:13" — a clock face of any kind. */
const CLOCK_TIME = /\b\d{1,2}:\d{2}\b/;

/** "5.35", "9.25" — an hours value. Bare integers are counts and allowed. */
const DECIMAL_NUMBER = /\b\d+\.\d+\b/;

describe("an owner’s own team: readiness, never sleep", () => {
  beforeEach(() => signInAs(world.ownerA.id));

  it("the exception list contains no clock time, no hours value, and no raw sleep field", async () => {
    const result = await invoke(exceptionsGET, { teamId: world.teamA.id });
    expect(result.status).toBe(200);

    // Non-vacuity: the athlete really is flagged, so there is a payload here
    // that a leak could hide in.
    expect(result.body.exceptions).toHaveLength(1);
    expect(result.text).toContain(world.athleteA.name);

    expect(result.text).not.toMatch(CLOCK_TIME);
    expect(result.text).not.toMatch(DECIMAL_NUMBER);

    for (const key of allKeys(result.body)) {
      expect(key, `payload exposed a sleep field: "${key}"`).not.toMatch(RAW_SLEEP_KEY);
    }
  });

  it("none of the athlete's actual seeded sleep values appear anywhere", async () => {
    const result = await invoke(exceptionsGET, { teamId: world.teamA.id });

    for (const value of Object.values(ATHLETE_A_SLEEP)) {
      expect(
        result.text.includes(String(value)),
        `leaked the athlete's own sleep value ${JSON.stringify(value)}`,
      ).toBe(false);
    }
  });

  it("an exception carries exactly a name, a color, a trend and a recommendation", async () => {
    const result = await invoke(exceptionsGET, { teamId: world.teamA.id });

    expect(Object.keys(result.body).sort()).toEqual(
      ["exceptions", "onTrack", "rosterSize", "teamName"].sort(),
    );
    for (const exception of result.body.exceptions) {
      expect(Object.keys(exception).sort()).toEqual(
        ["color", "name", "recommendation", "trend"].sort(),
      );
    }
  });

  it("the trend is a count, which is what the consent screen promises", async () => {
    const result = await invoke(exceptionsGET, { teamId: world.teamA.id });
    const { trend } = result.body.exceptions[0];

    // "Short on sleep 5 of 5 nights" — integers over integers, no durations.
    expect(trend).toMatch(/\d+ of \d+ night/);
    expect(TEAM_CONSENT_TEXT).toContain("a weekly count");
  });

  it("the planned sessions payload carries only owner-authored fields", async () => {
    // targetPaces is owner-authored free text and legitimately holds things
    // like "6x1200 @ 3:52/km", so the clock-time rule cannot apply here. The
    // guarantee instead is that no athlete-derived field exists in the shape.
    const result = await invoke(sessionsGET, { teamId: world.teamA.id });
    expect(result.status).toBe(200);

    for (const key of allKeys(result.body)) {
      expect(key, `sessions payload exposed a sleep field: "${key}"`).not.toMatch(RAW_SLEEP_KEY);
    }
    expect(result.text).not.toContain(world.athleteA.name);
  });

  it("the team list gives an owner counts, not athletes", async () => {
    const result = await invoke(teamsGET);
    expect(result.status).toBe(200);
    expect(result.body.owned[0].athleteCount).toBe(1);

    expect(result.text).not.toContain(world.athleteA.name);
    for (const key of allKeys(result.body)) {
      expect(key, `team list exposed a sleep field: "${key}"`).not.toMatch(RAW_SLEEP_KEY);
    }
  });
});

describe("join codes are not enumerable", () => {
  /** A code that is well formed and simply is not a team's. */
  const UNKNOWN_CODE = "ZZZZZZ";
  /** A code that is real but past its expiry. */
  const EXPIRED_CODE = "QQQQQQ";

  beforeEach(async () => {
    await prisma.team.create({
      data: {
        name: "Umberland Striders",
        sport: "track",
        ownerId: world.ownerB.id,
        joinCode: EXPIRED_CODE,
        joinCodeExpiresAt: new Date(Date.now() - 60_000),
      },
    });
    signInAs(world.athleteA.id);
  });

  it("an unknown code and an expired code are answered identically", async () => {
    const unknown = await invoke(joinPOST, { body: { code: UNKNOWN_CODE, consent: true } });
    const expired = await invoke(joinPOST, { body: { code: EXPIRED_CODE, consent: true } });

    expect(unknown.status).toBe(404);
    expect(expired.status).toBe(unknown.status);
    expect(expired.text).toBe(unknown.text);
  });

  it("an expired code does not reveal the team it belongs to, or admit anyone", async () => {
    const before = await prisma.teamMembership.count({ where: { userId: world.athleteA.id } });
    const expired = await invoke(joinPOST, { body: { code: EXPIRED_CODE, consent: true } });

    expect(expired.text).not.toContain("Umberland Striders");

    // Asserted as "nothing was added", not as a fixed total. An athlete can be
    // on any number of teams, so a hard-coded count here would break every time
    // the seeded world grows — and would fail for a reason that has nothing to
    // do with what this test is about.
    const after = await prisma.teamMembership.count({ where: { userId: world.athleteA.id } });
    expect(after).toBe(before);

    const admitted = await prisma.teamMembership.findFirst({
      where: { userId: world.athleteA.id, team: { joinCode: EXPIRED_CODE } },
    });
    expect(admitted).toBeNull();
  });

  it("a malformed code is rejected on format alone, before any lookup", async () => {
    // Malformed means wrong length, or containing one of the characters the
    // alphabet drops (I, L, O, 0, 1) precisely so they cannot be misread.
    // Note how little that excludes: "BANANA" is a perfectly well-formed code,
    // so this is a narrower category than "not a real word".
    const tooShort = await invoke(joinPOST, { body: { code: "ABC", consent: true } });
    const badAlphabet = await invoke(joinPOST, { body: { code: "AB0O1I", consent: true } });

    expect(tooShort.status).toBe(400);
    expect(badAlphabet.status).toBe(400);

    // Distinguishable from the 404s above, deliberately: this says the string
    // is not code-shaped, which is public knowledge about the format and
    // reveals nothing about which codes exist.
    const unknown = await invoke(joinPOST, { body: { code: UNKNOWN_CODE, consent: true } });
    expect(unknown.status).toBe(404);
    expect(tooShort.text).not.toBe(unknown.text);
  });

  it("a valid code still works, so the refusals above mean something", async () => {
    const joined = await invoke(joinPOST, { body: { code: world.teamB.joinCode, consent: true } });

    expect(joined.status).toBe(200);
    expect(joined.body.ok).toBe(true);
    expect(joined.body.membership.team.name).toBe(world.teamB.name);
  });

  it("joining without consent records nothing", async () => {
    const refused = await invoke(joinPOST, { body: { code: world.teamB.joinCode } });

    expect(refused.status).toBe(400);
    const membership = await prisma.teamMembership.findFirst({
      where: { teamId: world.teamB.id, userId: world.athleteA.id },
    });
    expect(membership).toBeNull();
  });
});
