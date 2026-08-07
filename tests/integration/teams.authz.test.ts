// Cross-team authorization, exercised as a person would: authenticate as one
// owner, ask for another owner's data, and look at what comes back.
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
import { POST as joinPOST } from "@/app/api/teams/join/route";
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

// Everyone who is not team B's owner. The distinction that matters is not
// "logged out" — it is "logged in, legitimately, as somebody else".
const OUTSIDERS: Array<{ name: string; userId: (w: World) => string }> = [
  { name: "owner A, who runs a different team", userId: (w) => w.ownerA.id },
  { name: "an athlete on team B asking for the owner view of their own team", userId: (w) => w.athleteB.id },
  { name: "a former member of team B whose status is LEFT", userId: (w) => w.formerAthleteB.id },
  { name: "an athlete on another team entirely", userId: (w) => w.athleteA.id },
  // Owning a team of your own grants nothing anywhere else. Worth stating now
  // that anyone can create one: "is an owner" is not a role a person holds, it
  // is a fact about one team.
  { name: "a captain who owns and runs a team of their own", userId: (w) => w.captain.id },
];

describe("an owner route asked for someone else’s team", () => {
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
        signInAs(world.ownerA.id);
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
    signInAs(world.ownerA.id);
    await invoke(sessionsPOST, {
      teamId: world.teamB.id,
      body: { date: new Date().toISOString(), sessionType: "tempo", description: "intrusion" },
    });

    const sessions = await prisma.plannedSession.findMany({ where: { teamId: world.teamB.id } });
    expect(sessions).toHaveLength(1);
    expect(sessions[0].description).toBe(world.sessionB.description);
  });

  it("a refused join-code POST does not rotate the victim's join code", async () => {
    signInAs(world.ownerA.id);
    await invoke(joinCodePOST, { teamId: world.teamB.id, method: "POST" });

    const team = await prisma.team.findUnique({ where: { id: world.teamB.id } });
    expect(team?.joinCode).toBe(world.teamB.joinCode);
  });

  it("a session id from another team cannot be deleted by passing your own teamId", async () => {
    // The guard passes here — owner A really does own team A — so the only
    // thing standing between owner A and team B's session is the teamId in
    // the deleteMany filter.
    signInAs(world.ownerA.id);
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
    signInAs(world.ownerA.id);
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
  it("owner A can read their own team’s exception list, athlete names and all", async () => {
    signInAs(world.ownerA.id);
    const result = await invoke(exceptionsGET, { teamId: world.teamA.id });

    expect(result.status).toBe(200);
    expect(result.body.teamName).toBe(world.teamA.name);
    expect(result.body.rosterSize).toBe(1);
    expect(result.text).toContain(world.athleteA.name);
    expect(result.body.exceptions).toHaveLength(1);
  });

  it("owner A can rotate their own join code", async () => {
    signInAs(world.ownerA.id);
    const result = await invoke(joinCodePOST, { teamId: world.teamA.id, method: "POST" });

    expect(result.status).toBe(200);
    expect(result.body.joinCode).toHaveLength(6);
    expect(result.body.joinCode).not.toBe(world.teamA.joinCode);
  });

  it("owner A can create, read and delete sessions on their own team", async () => {
    signInAs(world.ownerA.id);

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

  it("an athlete can read their own memberships, without any join code", async () => {
    signInAs(world.athleteA.id);
    const result = await invoke(teamsGET);

    expect(result.status).toBe(200);
    expect(result.body.owned).toHaveLength(0);
    // Two teams, because cross country and track are two rosters. Nothing
    // limits a user to one, and this is what says so.
    expect(result.body.memberships).toHaveLength(2);
    expect(result.body.memberships.map((m: any) => m.team.name).sort()).toEqual(
      [world.teamA.name, world.teamC.name].sort(),
    );
    // A member holding a working invite would make the roster effectively open.
    expect(result.text).not.toContain(world.teamA.joinCode);
    expect(result.text).not.toContain(world.teamC.joinCode);
  });

  it("a member of two teams is not shown as owning either of them", async () => {
    signInAs(world.athleteA.id);
    const result = await invoke(teamsGET);

    for (const membership of result.body.memberships) {
      expect(membership.ownedByYou).toBe(false);
    }
  });

  it("an owner listing their teams sees their own and only their own", async () => {
    signInAs(world.ownerA.id);
    const result = await invoke(teamsGET);

    expect(result.status).toBe(200);
    expect(result.body.owned).toHaveLength(1);
    expect(result.body.owned[0].name).toBe(world.teamA.name);
    expect(result.body.owned[0].athleteCount).toBe(1);
    expect(result.text).not.toContain(world.teamB.name);
  });

  it("creating a team makes the creator its owner, and nobody else’s", async () => {
    signInAs(world.athleteA.id);
    const result = await invoke(teamsPOST, { body: { name: "Cindersole Harriers" } });

    expect(result.status).toBe(201);
    const team = await prisma.team.findUnique({ where: { id: result.body.id } });
    expect(team?.ownerId).toBe(world.athleteA.id);
  });

  it("any signed-in athlete can create a team — there is no role to be granted", async () => {
    // The rule open team creation actually turns on. An athlete who has never
    // coached anything, holds no waitlist role and pays nothing gets a roster
    // and a join code, because the person who organizes the squad is usually
    // one of the people running in it.
    signInAs(world.athleteB.id);
    const result = await invoke(teamsPOST, { body: { name: "Pennyroyal Striders" } });

    expect(result.status).toBe(201);
    expect(result.body.joinCode).toMatch(/^[A-Z0-9]{6}$/);
  });
});

describe("owning a team and being on it are separate facts", () => {
  it("an owner who joined their own team appears in both lists", async () => {
    signInAs(world.captain.id);
    const result = await invoke(teamsGET);

    expect(result.body.owned).toHaveLength(1);
    expect(result.body.owned[0].name).toBe(world.teamC.name);
    expect(result.body.memberships).toHaveLength(1);
    expect(result.body.memberships[0].team.name).toBe(world.teamC.name);
    // The flag that stops the UI showing the same team twice with no
    // explanation of why.
    expect(result.body.memberships[0].ownedByYou).toBe(true);
  });

  it("an owner can join the team they created", async () => {
    // This used to be refused outright, which left the person who organized the
    // squad off their own roster — and, once check-in consistency is ranked,
    // off their own leaderboard.
    signInAs(world.ownerA.id);
    const joined = await invoke(joinPOST, {
      body: { code: world.teamA.joinCode, consent: true },
    });

    expect(joined.status).toBe(200);
    const membership = await prisma.teamMembership.findFirst({
      where: { teamId: world.teamA.id, userId: world.ownerA.id },
    });
    expect(membership?.status).toBe("ACTIVE");
  });

  it("an owner joining their own team still has to accept the consent screen", async () => {
    // No carve-out. An owner who is also a member has their readiness derived
    // like anyone else's, and their consent record should be auditable in
    // exactly the same way.
    signInAs(world.ownerA.id);
    const refused = await invoke(joinPOST, { body: { code: world.teamA.joinCode } });

    expect(refused.status).toBe(400);
    const membership = await prisma.teamMembership.findFirst({
      where: { teamId: world.teamA.id, userId: world.ownerA.id },
    });
    expect(membership).toBeNull();
  });

  it("an owner leaving their own team keeps the team", async () => {
    signInAs(world.captain.id);
    const left = await invoke(leavePOST, { body: { teamId: world.teamC.id } });
    expect(left.status).toBe(200);

    const team = await prisma.team.findUnique({ where: { id: world.teamC.id } });
    expect(team?.ownerId).toBe(world.captain.id);

    const after = await invoke(teamsGET);
    expect(after.body.owned).toHaveLength(1);
    expect(after.body.memberships).toHaveLength(0);
  });

  it("an owner still owns their team while holding no membership at all", async () => {
    // Owner A never joined team A. The exception list has to work for them
    // exactly as it does for the captain who did join.
    signInAs(world.ownerA.id);
    const result = await invoke(exceptionsGET, { teamId: world.teamA.id });

    expect(result.status).toBe(200);
    expect(result.body.rosterSize).toBe(1);
  });
});
