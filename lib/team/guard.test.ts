// Two layers of enforcement for the team-authorization rules.
//
// 1. The decision itself (isOwnerOf) is tested directly: a caller who is not
//    the recorded owner is refused, including for a team that does not exist.
//    The route translation is fixed by convention — null → 403 — and layer 2
//    checks every route actually follows it.
//
// 2. A source scan of every route under app/api/teams: any file handling a
//    [teamId] segment must call assertOwnerOf or assertMemberOf, must contain a
//    403 response, and no route may ever read a userId out of a request body —
//    the session is the only identity, which is precisely what makes "an owner
//    cannot enrol someone else" true at the API rather than the UI.
//
//    The two guards are not interchangeable and the scan does not treat them
//    as such: a route may use the weaker member check only by naming itself in
//    MEMBER_SCOPED_ROUTES below. Adding a file to that list is the deliberate
//    act of saying "every athlete on this team may read this", which is a
//    decision that should require editing a test rather than a route.
//
// There is no HTTP harness in this suite (unit tests run with no database),
// so cross-team requests cannot be exercised end-to-end here; the scan plus
// the pure test pin the two halves the 403 is made of. tests/integration/
// teams.authz.test.ts exercises the real handlers against a real database.

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { isOwnerOf } from "@/lib/team/guard";

describe("isOwnerOf", () => {
  const team = { id: "team_a", ownerId: "owner_1" };

  it("admits exactly the recorded owner", () => {
    expect(isOwnerOf(team, "owner_1")).toBe(true);
  });

  it("refuses any other user — reading another team's data is denied", () => {
    expect(isOwnerOf(team, "owner_2")).toBe(false);
    expect(isOwnerOf(team, "athlete_9")).toBe(false);
    expect(isOwnerOf(team, "")).toBe(false);
  });

  it("refuses when the team does not exist, indistinguishably", () => {
    expect(isOwnerOf(null, "owner_1")).toBe(false);
  });
});

// ── layer 2: every team route is actually guarded ───────────────────────────

const ROOT = join(__dirname, "..", "..");
const TEAMS_DIR = join(ROOT, "app", "api", "teams");

function routeFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...routeFiles(full));
    else if (entry === "route.ts") out.push(full);
  }
  return out;
}

/**
 * Routes allowed to use the weaker member check instead of owner-only.
 *
 * Paths are relative and use forward slashes. A file appears here only when
 * every ACTIVE member of the team is genuinely entitled to what it returns —
 * the consistency leaderboard, where the whole point is that the squad sees
 * each other's check-in rates. Anything that changes state, or that exposes
 * one athlete's sleep to another, stays owner-only and stays off this list.
 */
const MEMBER_SCOPED_ROUTES = new Set<string>([
  // The consistency leaderboard. Every athlete on the roster sees every other
  // athlete's check-in rate, which is exactly what the consent text promises
  // teammates can see — and it carries no sleep value of any kind, which
  // tests/integration/teams.leaderboard.test.ts holds it to.
  "app/api/teams/[teamId]/leaderboard/route.ts",
]);

describe("every /api/teams route enforces authorization", () => {
  const files = routeFiles(TEAMS_DIR);

  it("found the team routes (guard cannot pass vacuously)", () => {
    expect(files.length).toBeGreaterThanOrEqual(3);
  });

  it("the member-scoped allowlist names only routes that exist", () => {
    // A stale entry here would silently permit the weaker guard on a path that
    // gets reused later for something else.
    const known = new Set(files.map((f) => relative(ROOT, f).replace(/\\/g, "/")));
    for (const allowed of Array.from(MEMBER_SCOPED_ROUTES)) {
      expect(known.has(allowed), `${allowed} is allowlisted but does not exist`).toBe(true);
    }
  });

  for (const file of routeFiles(TEAMS_DIR)) {
    const rel = relative(ROOT, file);
    const posixRel = rel.replace(/\\/g, "/");
    const source = readFileSync(file, "utf8");
    const isTeamScoped = /\[teamId\]/.test(rel);
    const memberScoped = MEMBER_SCOPED_ROUTES.has(posixRel);
    const guardName = memberScoped ? "assertMemberOf" : "assertOwnerOf";
    const guardPattern = memberScoped ? /assertMemberOf\s*\(/ : /assertOwnerOf\s*\(/;
    const guardPatternGlobal = memberScoped ? /assertMemberOf\s*\(/g : /assertOwnerOf\s*\(/g;

    if (isTeamScoped) {
      it(`${rel} calls ${guardName} and returns 403 on refusal`, () => {
        expect(source).toMatch(guardPattern);
        expect(source).toMatch(/status:\s*403/);
      });

      it(`${rel} guards every exported handler, not just one of them`, () => {
        // A file-level "does the guard appear anywhere" check passes a
        // three-handler route that guards two of them. Counting is crude but
        // it closes that gap: a new verb added without a guard fails here.
        const handlers = source.match(/export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)\b/g) ?? [];
        const guards = source.match(guardPatternGlobal) ?? [];
        expect(handlers.length).toBeGreaterThan(0);
        expect(
          guards.length,
          `${handlers.length} exported handler(s) but only ${guards.length} ${guardName} call(s)`,
        ).toBeGreaterThanOrEqual(handlers.length);
      });

      if (!memberScoped) {
        it(`${rel} does not quietly downgrade to the member check`, () => {
          // The failure this prevents: someone hits a 403 while testing, swaps
          // assertOwnerOf for assertMemberOf because it makes the error go
          // away, and every athlete on the team can now rotate the join code.
          // Downgrading is allowed — it just has to be done by adding the file
          // to MEMBER_SCOPED_ROUTES above, where it is visible in review.
          expect(
            source,
            "uses assertMemberOf without being listed in MEMBER_SCOPED_ROUTES",
          ).not.toMatch(/assertMemberOf\s*\(/);
        });
      }
    }

    it(`${rel} scopes any teamId read from the body by the session user`, () => {
      // The check above keys on the file PATH, so a route that takes a team id
      // from the request body instead of the URL is exempt from it entirely.
      // Such a route must narrow by the session user's id — as leave/route.ts
      // does, with userId in the updateMany filter — or it is acting on a team
      // on nothing but the caller's say-so.
      if (/body\.teamId/.test(source)) {
        expect(source, "reads body.teamId without scoping the query by userId").toMatch(/userId/);
      }
    });

    it(`${rel} never takes a user identity from the request body`, () => {
      // The session is the only identity. Any of these appearing in a team
      // route means someone built a path to act on another person's account.
      expect(source).not.toMatch(/body\s*[.[]\s*['"]?userId/i);
      expect(source).not.toMatch(/body\s*[.[]\s*['"]?athleteId/i);
      expect(source).not.toMatch(/body\s*[.[]\s*['"]?email/i);
    });

    it(`${rel} resolves the caller from the server session`, () => {
      expect(source).toMatch(/getServerSession/);
    });
  }
});
