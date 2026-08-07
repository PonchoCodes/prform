// Cross-team authorization, exercised as a person would: authenticate as one
// coach, ask for another coach's data, and look at what comes back.
//
// The source-scan tests in lib/team/guard.test.ts stay — they are cheap and
// they catch a brand new route that forgets the guard entirely. What they
// cannot see is whether the guard runs before the data is read, whether it
// checks the right team, or whether anyone acts on its answer. These tests do
// not read the source. They read the response body.

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";

vi.mock("next-auth", async () => {
  const { currentSession } = await import("./harness");
  return { default: {}, getServerSession: async () => currentSession() };
});

import { GET as exceptionsGET } from "@/app/api/teams/[teamId]/exceptions/route";
import { POST as joinCodePOST } from "@/app/api/teams/[teamId]/join-code/route";
import {
  GET as sessionsGET,
  POST as sessionsPOST,
  DELETE as sessionsDELETE,
} from "@/app/api/teams/[teamId]/sessions/route";
import { GET as teamsGET, POST as teamsPOST } from "@/app/api/teams/route";
import { POST as leavePOST } from "@/app/api/teams/leave/route";
import { prisma } from "@/lib/prisma";
import { invoke, signInAs, signOut, expectRefusal, type Invocation } from "./harness";

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

// Every handler that takes a teamId. Each entry is a real request, with a
// plausible body where the verb needs one — a handler must refuse before it
// ever looks at the body.
const TEAM_SCOPED_ROUTES: Array<{ name: string; call: (teamId: string) => Promise<Invocation> }> = [
  {
    name: "GET /api/teams/[teamId]/exceptions",
    call: (teamId) => invoke(exceptionsGET, { teamId }),
  },
  {
    name: "POST /api/teams/[teamId]/join-code",
    call: (teamId) => invoke(joinCodePOST, { teamId, method: "POST" }),
  },
  {
    name: "GET /api/teams/[teamId]/sessions",
    call: (teamId) => invoke(sessionsGET, { teamId }),
  },
  {
    name: "POST /api/teams/[teamId]/sessions",
    // This body is deliberately incomplete — no durationMinutes, which the
    // handler requires. A 403 rather than a 400 is the assertion that the
    // guard runs before the request is even validated, let alone acted on.
    call: (teamId) =>
      invoke(sessionsPOST, {
        teamId,
        body: { date: new Date().toISOString(), sessionType: "tempo", description: "intrusion" },
      }),
  },
  {
    name: "DELETE /api/teams/[teamId]/sessions",
    call: (teamId) => invoke(sessionsDELETE, { teamId, method: "DELETE", body: { id: "anything" } }),
  },
];

// Everyone who is not team B's coach. The distinction that matters is not
// "logged out" — it is "logged in, legitimately, as somebody else".
const OUTSIDERS: Array<{ name: string; userId: (w: World) => string }> = [
  { name: "Coach A, who coaches a different team", userId: (w) => w.coachA.id },
  { name: "an athlete on team B asking for the coach view of their own team", userId: (w) => w.athleteB.id },
  { name: "a former member of team B whose status is LEFT", userId: (w) => w.formerAthleteB.id },
  { name: "an athlete on another team entirely", userId: (w) => w.athleteA.id },
];

describe("a coach route asked for someone else's team", () => {
  for (const route of TEAM_SCOPED_ROUTES) {
    describe(route.name, () => {
      for (const outsider of OUTSIDERS) {
        it(`refuses ${outsider.name}, and returns none of the team's data`, async () => {
          signInAs(outsider.userId(world));
          const result = await route.call(world.teamB.id);
          expectRefusal(result, world);
        });
      }

      it("refuses an unauthenticated caller", async () => {
        const result = await route.call(world.teamB.id);
        expectRefusal(result, world, 401);
      });

      it("answers 'no such team' and 'not your team' identically", async () => {
        signInAs(world.coachA.id);
        const notYours = await route.call(world.teamB.id);
        const missing = await route.call(world.missingTeamId);

        // Byte-identical, not merely both-403: any difference at all — a
        // distinct message, a different key order — tells an attacker which
        // team ids are real.
        expect(missing.status).toBe(notYours.status);
        expect(missing.text).toBe(notYours.text);
      });
    });
  }
});

describe("refusal leaves the data alone", () => {
  it("a refused POST does not create a session on the victim's team", async () => {
    signInAs(world.coachA.id);
    await invoke(sessionsPOST, {
      teamId: world.teamB.id,
      body: { date: new Date().toISOString(), sessionType: "tempo", description: "intrusion" },
    });

    const sessions = await prisma.plannedSession.findMany({ where: { teamId: world.teamB.id } });
    expect(sessions).toHaveLength(1);
    expect(sessions[0].description).toBe(world.sessionB.description);
  });

  it("a refused join-code POST does not rotate the victim's join code", async () => {
    signInAs(world.coachA.id);
    await invoke(joinCodePOST, { teamId: world.teamB.id, method: "POST" });

    const team = await prisma.team.findUnique({ where: { id: world.teamB.id } });
    expect(team?.joinCode).toBe(world.teamB.joinCode);
  });

  it("a session id from another team cannot be deleted by passing your own teamId", async () => {
    // The guard passes here — Coach A really does coach team A — so the only
    // thing standing between Coach A and team B's session is the teamId in
    // the deleteMany filter.
    signInAs(world.coachA.id);
    const result = await invoke(sessionsDELETE, {
      teamId: world.teamA.id,
      method: "DELETE",
      body: { id: world.sessionB.id },
    });

    expect(result.status).toBe(200);
    expect(result.body.deleted).toBe(0);
    const survivor = await prisma.plannedSession.findUnique({ where: { id: world.sessionB.id } });
    expect(survivor).not.toBeNull();
  });

  it("leaving a team you were never on changes nothing, and reads the same as a team that does not exist", async () => {
    signInAs(world.coachA.id);
    const notMine = await invoke(leavePOST, { body: { teamId: world.teamB.id } });
    const missing = await invoke(leavePOST, { body: { teamId: world.missingTeamId } });

    expect(notMine.status).toBe(404);
    expect(missing.text).toBe(notMine.text);

    const membership = await prisma.teamMembership.findFirst({
      where: { teamId: world.teamB.id, userId: world.athleteB.id },
    });
    expect(membership?.status).toBe("ACTIVE");
  });

  it("one athlete cannot remove another from a roster", async () => {
    signInAs(world.athleteA.id);
    await invoke(leavePOST, { body: { teamId: world.teamB.id } });

    const membership = await prisma.teamMembership.findFirst({
      where: { teamId: world.teamB.id, userId: world.athleteB.id },
    });
    expect(membership?.status).toBe("ACTIVE");
  });
});

// If the guard refused everything, every test above would pass. These are the
// tests that fail when it does.
describe("the guard is not simply refusing everyone", () => {
  it("Coach A can read their own team's exception list, athlete names and all", async () => {
    signInAs(world.coachA.id);
    const result = await invoke(exceptionsGET, { teamId: world.teamA.id });

    expect(result.status).toBe(200);
    expect(result.body.teamName).toBe(world.teamA.name);
    expect(result.body.rosterSize).toBe(1);
    expect(result.text).toContain(world.athleteA.name);
    expect(result.body.exceptions).toHaveLength(1);
  });

  it("Coach A can rotate their own join code", async () => {
    signInAs(world.coachA.id);
    const result = await invoke(joinCodePOST, { teamId: world.teamA.id, method: "POST" });

    expect(result.status).toBe(200);
    expect(result.body.joinCode).toHaveLength(6);
    expect(result.body.joinCode).not.toBe(world.teamA.joinCode);
  });

  it("Coach A can create, read and delete sessions on their own team", async () => {
    signInAs(world.coachA.id);

    const created = await invoke(sessionsPOST, {
      teamId: world.teamA.id,
      body: {
        date: new Date().toISOString(),
        sessionType: "track",
        durationMinutes: 75,
        description: "8x400",
      },
    });
    expect(created.status).toBe(201);

    const listed = await invoke(sessionsGET, { teamId: world.teamA.id });
    expect(listed.status).toBe(200);
    expect(listed.body.sessions).toHaveLength(1);

    const deleted = await invoke(sessionsDELETE, {
      teamId: world.teamA.id,
      method: "DELETE",
      body: { id: created.body.id },
    });
    expect(deleted.body.deleted).toBe(1);
  });

  it("an athlete can read their own membership, without the join code", async () => {
    signInAs(world.athleteA.id);
    const result = await invoke(teamsGET);

    expect(result.status).toBe(200);
    expect(result.body.coached).toHaveLength(0);
    expect(result.body.memberships).toHaveLength(1);
    expect(result.body.memberships[0].team.name).toBe(world.teamA.name);
    // A member holding a working invite would make the roster effectively open.
    expect(result.text).not.toContain(world.teamA.joinCode);
  });

  it("a coach listing their teams sees their own and only their own", async () => {
    signInAs(world.coachA.id);
    const result = await invoke(teamsGET);

    expect(result.status).toBe(200);
    expect(result.body.coached).toHaveLength(1);
    expect(result.body.coached[0].name).toBe(world.teamA.name);
    expect(result.body.coached[0].athleteCount).toBe(1);
    expect(result.text).not.toContain(world.teamB.name);
  });

  it("creating a team makes the creator its coach, and nobody else's", async () => {
    signInAs(world.athleteA.id);
    const result = await invoke(teamsPOST, { body: { name: "Cindersole Harriers" } });

    expect(result.status).toBe(201);
    const team = await prisma.team.findUnique({ where: { id: result.body.id } });
    expect(team?.coachId).toBe(world.athleteA.id);
  });
});
