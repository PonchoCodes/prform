// The consistency leaderboard, against a real database.
//
// Two things are being held here, and the second is the reason the file exists.
//
//   1. It is member-visible. Every other team route is owner-only; this one
//      admits any ACTIVE member, and still refuses everyone else.
//
//   2. It carries no sleep data. The athletes on the seeded team have real
//      SleepLog rows with real durations, bedtimes and wake times, and the
//      route reads those rows — it just reads the `date` column and nothing
//      else. These tests walk the actual response looking for any of it.
//
// The counting logic itself is covered exhaustively, with injected dates, in
// lib/team/leaderboard.test.ts. What cannot be covered there is whether the
// query, the serialization and the guard behave on real rows, so that is what
// this file spends its time on.

import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";

vi.mock("next-auth", async () => {
  const { currentSession } = await import("./harness");
  return { default: {}, getServerSession: async () => currentSession() };
});

import { GET as leaderboardGET } from "@/app/api/teams/[teamId]/leaderboard/route";
import { prisma } from "@/lib/prisma";
import { invoke, signInAs, signOut } from "./harness";
import { resetDatabase, seedWorld, ATHLETE_A_SLEEP, type World } from "./world";
import { weekStartOf, windowEndFor } from "@/lib/team/leaderboard";

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
const RAW_SLEEP_KEY = /bedtime|waketime|wake_?at|sleep|hours|hitTarget|onset|needsReview|target/i;

/** "23:52", "5:13" — a clock face of any kind. */
const CLOCK_TIME = /\b\d{1,2}:\d{2}\b/;

/** "5.35", "9.25" — an hours value. Counts and percentages are integers. */
const DECIMAL_NUMBER = /\b\d+\.\d+\b/;

/**
 * The window the route will have used, computed the same way it does. Today's
 * date decides it, so a test that hard-coded a count would pass or fail
 * depending on the day of the week it ran.
 */
function currentWindow() {
  const today = new Date().toISOString().slice(0, 10);
  const weekStart = weekStartOf(today);
  return { today, weekStart, windowEnd: windowEndFor(today, weekStart) };
}

describe("the leaderboard ranks check-ins and nothing else", () => {
  beforeEach(() => signInAs(world.athleteA.id));

  it("contains no clock time, no decimal, and no sleep-shaped field", async () => {
    const result = await invoke(leaderboardGET, { teamId: world.teamC.id });
    expect(result.status).toBe(200);

    // Non-vacuity: there really are athletes on this board, and they really do
    // have sleep rows in the database for the route to have leaked.
    expect(result.body.entries.length).toBeGreaterThan(0);
    expect(result.text).toContain(world.athleteA.name);
    const logCount = await prisma.sleepLog.count({ where: { userId: world.athleteA.id } });
    expect(logCount).toBeGreaterThan(0);

    expect(result.text).not.toMatch(CLOCK_TIME);
    expect(result.text).not.toMatch(DECIMAL_NUMBER);

    for (const key of allKeys(result.body)) {
      expect(key, `leaderboard exposed a sleep field: "${key}"`).not.toMatch(RAW_SLEEP_KEY);
    }
  });

  it("leaks none of the athlete's actual seeded sleep values", async () => {
    const result = await invoke(leaderboardGET, { teamId: world.teamC.id });

    for (const value of Object.values(ATHLETE_A_SLEEP)) {
      expect(
        result.text.includes(String(value)),
        `leaked a sleep value onto a board every teammate can read: ${JSON.stringify(value)}`,
      ).toBe(false);
    }
  });

  it("an entry carries exactly a name, two counts, a rate and a position", async () => {
    const result = await invoke(leaderboardGET, { teamId: world.teamC.id });

    expect(Object.keys(result.body).sort()).toEqual(
      ["entries", "teamName", "weekStart", "windowEnd"].sort(),
    );
    for (const entry of result.body.entries) {
      expect(Object.keys(entry).sort()).toEqual(
        ["isYou", "name", "nightsLogged", "nightsPossible", "position", "rate"].sort(),
      );
    }
  });

  it("counts the nights actually logged inside this week's window", async () => {
    const { weekStart, windowEnd } = currentWindow();
    const result = await invoke(leaderboardGET, { teamId: world.teamC.id });

    // Computed from the database rather than hard-coded, so this holds on any
    // day of the week — including Monday, when the window is empty and the
    // right answer for everyone is zero.
    //
    // `lt` the day AFTER windowEnd, not `lte` windowEnd: the bound is a date,
    // and an `lte` against midnight would exclude the whole of that final day.
    const dayAfterWindow = windowEnd
      ? new Date(new Date(`${windowEnd}T00:00:00.000Z`).getTime() + 86_400_000)
      : null;
    const expected = dayAfterWindow
      ? await prisma.sleepLog.count({
          where: {
            userId: world.athleteA.id,
            date: { gte: new Date(`${weekStart}T00:00:00.000Z`), lt: dayAfterWindow },
          },
        })
      : 0;

    const mine = result.body.entries.find((e: any) => e.isYou);
    expect(mine).toBeDefined();
    expect(mine.nightsLogged).toBe(expected);
  });

  it("never reports a rate above 100", async () => {
    const result = await invoke(leaderboardGET, { teamId: world.teamC.id });
    for (const entry of result.body.entries) {
      if (entry.rate !== null) {
        expect(entry.rate).toBeGreaterThanOrEqual(0);
        expect(entry.rate).toBeLessThanOrEqual(100);
      }
    }
  });

  it("marks exactly one row as the reader's own", async () => {
    const result = await invoke(leaderboardGET, { teamId: world.teamC.id });
    expect(result.body.entries.filter((e: any) => e.isYou)).toHaveLength(1);
  });
});

describe("who can read the board", () => {
  it("an ordinary member can — this is the one member-visible team route", async () => {
    signInAs(world.athleteA.id);
    const result = await invoke(leaderboardGET, { teamId: world.teamC.id });

    expect(result.status).toBe(200);
    // Athlete A does not own team C. On every other team route this same call
    // is a 403, which is the whole point of the separate guard.
    expect(result.body.entries.map((e: any) => e.name).sort()).toEqual(
      [world.athleteA.name, world.captain.name].sort(),
    );
  });

  it("the owner can, whether or not they joined their own roster", async () => {
    // The captain owns team C and is on it; owner A owns team A and is not.
    signInAs(world.captain.id);
    expect((await invoke(leaderboardGET, { teamId: world.teamC.id })).status).toBe(200);

    signInAs(world.ownerA.id);
    expect((await invoke(leaderboardGET, { teamId: world.teamA.id })).status).toBe(200);
  });

  it("an athlete on another team cannot", async () => {
    signInAs(world.athleteB.id);
    const result = await invoke(leaderboardGET, { teamId: world.teamC.id });

    expect(result.status).toBe(403);
    expect(result.text).not.toContain(world.athleteA.name);
    expect(result.text).not.toContain(world.captain.name);
  });

  it("a former member cannot — leaving takes their access with it", async () => {
    signInAs(world.formerAthleteB.id);
    const result = await invoke(leaderboardGET, { teamId: world.teamB.id });
    expect(result.status).toBe(403);
  });

  it("a signed-out request cannot", async () => {
    signOut();
    const result = await invoke(leaderboardGET, { teamId: world.teamC.id });
    expect(result.status).toBe(401);
  });

  it("a team that does not exist is refused the same way as one that is not yours", async () => {
    signInAs(world.athleteA.id);
    const missing = await invoke(leaderboardGET, { teamId: world.missingTeamId });
    const notMine = await invoke(leaderboardGET, { teamId: world.teamB.id });

    // Distinguishing them would let anyone probe which team ids exist.
    expect(missing.status).toBe(403);
    expect(missing.text).toBe(notMine.text);
  });
});

describe("who appears on the board", () => {
  it("lists every ACTIVE member, including an owner who joined", async () => {
    signInAs(world.captain.id);
    const result = await invoke(leaderboardGET, { teamId: world.teamC.id });

    // The captain runs the team and runs on it. Before owners could join their
    // own team, the person who organized the squad was absent from their own
    // board.
    const names = result.body.entries.map((e: any) => e.name);
    expect(names).toContain(world.captain.name);
    expect(names).toContain(world.athleteA.name);
  });

  it("drops someone the moment they leave", async () => {
    signInAs(world.captain.id);
    const before = await invoke(leaderboardGET, { teamId: world.teamC.id });
    expect(before.text).toContain(world.athleteA.name);

    await prisma.teamMembership.updateMany({
      where: { teamId: world.teamC.id, userId: world.athleteA.id },
      data: { status: "LEFT" },
    });

    const after = await invoke(leaderboardGET, { teamId: world.teamC.id });
    // The consent screen promises leaving removes their name from the board
    // immediately. This is that promise.
    expect(after.text).not.toContain(world.athleteA.name);
  });

  it("shows an owner who never joined their own team an empty-but-valid board", async () => {
    // Owner A owns team A; the only ACTIVE member is athlete A.
    signInAs(world.ownerA.id);
    const result = await invoke(leaderboardGET, { teamId: world.teamA.id });

    expect(result.status).toBe(200);
    expect(result.body.entries.map((e: any) => e.name)).toEqual([world.athleteA.name]);
    // They are not on the roster, so no row is theirs.
    expect(result.body.entries.every((e: any) => e.isYou === false)).toBe(true);
  });
});
