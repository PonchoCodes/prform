// Two layers of enforcement for the coach-authorization rule.
//
// 1. The decision itself (isCoachOf) is tested directly: a caller who is not
//    the recorded coach is refused, including for a team that does not exist.
//    The route translation is fixed by convention — null → 403 — and layer 2
//    checks every route actually follows it.
//
// 2. A source scan of every route under app/api/teams: any file handling a
//    [teamId] segment must call assertCoachOf (or explicitly declare itself an
//    athlete-membership route), must contain a 403 response, and no route may
//    ever read a userId out of a request body — the session is the only
//    identity, which is precisely what makes "a coach cannot enrol someone
//    else" true at the API rather than the UI.
//
// There is no HTTP harness in this suite (unit tests run with no database),
// so cross-team requests cannot be exercised end-to-end here; the scan plus
// the pure test pin the two halves the 403 is made of.

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { isCoachOf } from "@/lib/team/guard";

describe("isCoachOf", () => {
  const team = { id: "team_a", coachId: "coach_1" };

  it("admits exactly the recorded coach", () => {
    expect(isCoachOf(team, "coach_1")).toBe(true);
  });

  it("refuses any other user — reading another team's data is denied", () => {
    expect(isCoachOf(team, "coach_2")).toBe(false);
    expect(isCoachOf(team, "athlete_9")).toBe(false);
    expect(isCoachOf(team, "")).toBe(false);
  });

  it("refuses when the team does not exist, indistinguishably", () => {
    expect(isCoachOf(null, "coach_1")).toBe(false);
  });
});

// ── layer 2: every coach route is actually guarded ──────────────────────────

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

describe("every /api/teams route enforces authorization", () => {
  const files = routeFiles(TEAMS_DIR);

  it("found the team routes (guard cannot pass vacuously)", () => {
    expect(files.length).toBeGreaterThanOrEqual(3);
  });

  for (const file of routeFiles(TEAMS_DIR)) {
    const rel = relative(ROOT, file);
    const source = readFileSync(file, "utf8");
    const isTeamScoped = /\[teamId\]/.test(rel);

    if (isTeamScoped) {
      it(`${rel} calls assertCoachOf and returns 403 on refusal`, () => {
        expect(source).toMatch(/assertCoachOf\s*\(/);
        expect(source).toMatch(/status:\s*403/);
      });
    }

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
