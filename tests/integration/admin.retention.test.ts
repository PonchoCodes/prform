// The retention page's data, against a real database.
//
// Two things are being held here.
//
//   1. The gate. This is the most sensitive endpoint in the app: behavioural
//      data about every account, most of them minors'. Everyone who is not the
//      configured admin is refused, including a signed-in athlete and a team
//      owner, neither of whom has any special claim to it.
//
//   2. The shape. It returns counts. Not names, not emails, not user ids —
//      because a page built from counts cannot quietly become a page somebody
//      browses individual teenagers on.
//
// The cohort arithmetic itself is covered with injected dates in
// lib/retention.test.ts. What that cannot cover is whether the Prisma queries
// run at all, which is the other half of what this file is for.

import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";

vi.mock("next-auth", async () => {
  const { currentSession } = await import("./harness");
  return { default: {}, getServerSession: async () => currentSession() };
});

import { GET as retentionGET } from "@/app/api/admin/retention/route";
import { prisma } from "@/lib/prisma";
import { invoke, signInAs, signOut } from "./harness";
import { resetDatabase, seedWorld, ATHLETE_A_SLEEP, type World } from "./world";

const ADMIN_EMAIL = "admin@example.test";

let world: World;

beforeEach(async () => {
  process.env.ADMIN_EMAIL = ADMIN_EMAIL;
  await resetDatabase();
  world = await seedWorld();
  signOut();
});

afterAll(async () => {
  await resetDatabase();
  await prisma.$disconnect();
});

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

describe("who can read retention", () => {
  it("refuses a signed-out request", async () => {
    expect((await invoke(retentionGET)).status).toBe(403);
  });

  it("refuses an ordinary athlete", async () => {
    signInAs(world.athleteA.id, "athlete.a@example.test");
    expect((await invoke(retentionGET)).status).toBe(403);
  });

  it("refuses a team owner, who has no claim to platform-wide data", async () => {
    signInAs(world.ownerA.id, world.ownerA.email);
    expect((await invoke(retentionGET)).status).toBe(403);
  });

  it("refuses everyone when ADMIN_EMAIL is unset", async () => {
    // Fails closed. An environment that forgot the variable must not open the
    // endpoint to the first person who asks.
    delete process.env.ADMIN_EMAIL;
    signInAs(world.ownerA.id, world.ownerA.email);
    expect((await invoke(retentionGET)).status).toBe(403);
  });

  it("admits the configured admin", async () => {
    signInAs(world.ownerA.id, ADMIN_EMAIL);
    expect((await invoke(retentionGET)).status).toBe(200);
  });
});

describe("what the admin actually gets", () => {
  beforeEach(() => signInAs(world.ownerA.id, ADMIN_EMAIL));

  it("returns counts, and every query runs", async () => {
    const result = await invoke(retentionGET);

    expect(result.status).toBe(200);
    expect(result.body.totals.users).toBeGreaterThan(0);
    expect(Array.isArray(result.body.cohorts)).toBe(true);
    expect(Array.isArray(result.body.weeklyActive)).toBe(true);
    expect(Array.isArray(result.body.groups)).toBe(true);
    // The groupBy on SentMessage is the query most likely to break silently.
    expect(result.body.messages).toBeDefined();
    expect(typeof result.body.messages.sent).toBe("number");
    expect(typeof result.body.messages.replied).toBe("number");
  });

  it("names teams but never people", async () => {
    const result = await invoke(retentionGET);

    // Team names are the point of the rollup: a row labelled "team 3" answers
    // the comparison question for nobody.
    expect(result.text).toContain(world.teamA.name);

    // Athletes are counted, never named.
    expect(result.text).not.toContain(world.athleteA.name);
    expect(result.text).not.toContain(world.athleteB.name);
    expect(result.text).not.toContain(world.captain.name);
    expect(result.text).not.toContain("@example.test");
    expect(result.text).not.toContain(world.athleteA.id);
  });

  it("carries no sleep values, only counts of nights", async () => {
    const result = await invoke(retentionGET);

    for (const value of Object.values(ATHLETE_A_SLEEP)) {
      expect(
        result.text.includes(String(value)),
        `retention leaked a sleep value: ${JSON.stringify(value)}`,
      ).toBe(false);
    }
    for (const key of allKeys(result.body)) {
      expect(key, `retention exposed a sleep field: "${key}"`).not.toMatch(
        /bedtime|waketime|wake_?at|hitTarget|onset|needsReview/i,
      );
    }
  });

  it("counts the seeded athletes as having logged nights", async () => {
    // Non-vacuity: the seeded world gives athlete A and athlete B five nights
    // each, so a funnel of all zeroes would mean the join is broken.
    const result = await invoke(retentionGET);
    expect(result.body.totals.everLogged).toBeGreaterThanOrEqual(2);
  });

  it("puts every team and a solo row in the rollup", async () => {
    const result = await invoke(retentionGET);
    const labels = result.body.groups.map((g: any) => g.label);

    expect(labels).toContain(world.teamA.name);
    expect(labels).toContain(world.teamC.name);
    expect(labels).toContain("Solo (no team)");
  });

  it("marks a cohort that is too young to have reached four weeks", async () => {
    // Everyone in the seeded world signed up moments ago.
    const result = await invoke(retentionGET);
    expect(result.body.cohorts[0].fourWeeksMeasurable).toBe(false);
  });
});
