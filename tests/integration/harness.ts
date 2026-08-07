// Calling a route handler the way a request would, with a session attached.
//
// Next 14 app-router handlers are plain functions of (Request, { params }), so
// a test can call one directly. Everything below the session read — the guard,
// Prisma, the real database, the serialized response — is the production code
// path. The one substitution is getServerSession, mocked per test file, which
// is what "authenticated as Coach A" means here. These tests therefore prove
// things about handlers, not about NextAuth or middleware.

import { expect } from "vitest";
import type { World } from "./world";

// ── who is logged in ────────────────────────────────────────────────────────

let signedInUserId: string | null = null;

export function signInAs(userId: string) {
  signedInUserId = userId;
}

export function signOut() {
  signedInUserId = null;
}

/** Read by the next-auth mock each test file installs. */
export function currentSession() {
  return signedInUserId ? { user: { id: signedInUserId } } : null;
}

// ── calling a handler ───────────────────────────────────────────────────────

export interface Invocation {
  status: number;
  /**
   * Parsed JSON, or null if the body was not JSON. Deliberately untyped: the
   * point of these tests is to inspect what a handler actually returned, not
   * what its declared return type promises — a leak would be invisible if the
   * assertions could only see the fields the type admits.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any;
  /** The raw response body — what a leak would actually travel in. */
  text: string;
}

/**
 * Generic in the handler's context type so one helper can drive every route:
 * the team-scoped handlers declare `{ params: { teamId: string } }` and the
 * collection routes take nothing.
 */
export async function invoke<Ctx>(
  handler: (req: Request, ctx: Ctx) => Promise<Response>,
  opts: {
    teamId?: string;
    body?: unknown;
    method?: string;
    url?: string;
  } = {},
): Promise<Invocation> {
  const method = opts.method ?? (opts.body === undefined ? "GET" : "POST");
  const req = new Request(opts.url ?? "http://localhost/api/teams", {
    method,
    headers: { "content-type": "application/json" },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });

  const ctx = { params: opts.teamId ? { teamId: opts.teamId } : {} } as Ctx;
  const res = await handler(req, ctx);

  const text = await res.text();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any = null;
  try {
    body = JSON.parse(text);
  } catch {
    /* left null — asserted on via `text` */
  }
  return { status: res.status, body, text };
}

// ── what a refusal is allowed to contain ────────────────────────────────────

/**
 * Every string in the seeded world that belongs to team B. If one of these
 * turns up in a response someone outside team B received, that is the leak
 * this whole suite exists to catch.
 */
export function teamBSecrets(world: World): Array<[string, string]> {
  return [
    ["team name", world.teamB.name],
    ["join code", world.teamB.joinCode],
    ["athlete name", world.athleteB.name],
    ["former athlete name", world.formerAthleteB.name],
    ["planned session description", world.sessionB.description],
    ["planned session paces", world.sessionB.targetPaces],
    ["team id", world.teamB.id],
  ];
}

/** Keys that only ever appear on a successful coach response. */
const COACH_PAYLOAD_KEYS = [
  "teamName",
  "rosterSize",
  "onTrack",
  "exceptions",
  "sessions",
  "joinCode",
  "joinCodeExpiresAt",
];

/**
 * A refusal must be a refusal and nothing else: the right status, none of
 * team B's strings anywhere in the raw body, and no coach-shaped payload key
 * — which covers the counts (`rosterSize`, `onTrack`) as well as the names.
 */
export function expectRefusal(result: Invocation, world: World, status = 403) {
  expect(result.status).toBe(status);

  for (const [label, secret] of teamBSecrets(world)) {
    expect(
      result.text.includes(secret),
      `response leaked team B's ${label} (${JSON.stringify(secret)}) in: ${result.text}`,
    ).toBe(false);
  }

  if (result.body && typeof result.body === "object") {
    for (const key of COACH_PAYLOAD_KEYS) {
      expect(
        Object.prototype.hasOwnProperty.call(result.body, key),
        `refusal carried the coach-only key "${key}": ${result.text}`,
      ).toBe(false);
    }
  }
}
