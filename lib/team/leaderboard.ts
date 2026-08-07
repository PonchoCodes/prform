// The consistency leaderboard: who checked in, and how often, this week.
//
// ── What this ranks, and what it must never rank ────────────────────────────
//
// Nights logged out of nights possible. That is the whole metric. Not duration,
// not bedtime, not whether a target was hit, not a recovery score — nothing
// about how anyone actually slept.
//
// This is not squeamishness, it is the design. A teenager can decide to open
// the app and press a button; they cannot decide to sleep nine hours when they
// have a chemistry final, a shift, a sibling and a bus at 6:20. Ranking a
// squad on sleep duration would put the kid with the hardest life at the
// bottom of a public list for reasons that are not theirs, and would teach
// everyone else that the way to climb it is to lie. Ranking on check-ins asks
// for the one thing every athlete can actually give, and the data stays honest
// because there is nothing to gain by fudging it.
//
// The payload shape enforces this — see tests/integration/teams.leaderboard
// .test.ts, which fails if any sleep-shaped field or value reaches the wire.
//
// ── The window ──────────────────────────────────────────────────────────────
//
// A week, Monday to Sunday, starting over every Monday. Deliberately short:
// on an all-time board the athlete who missed a fortnight in September is
// buried until June, and a metric you cannot climb out of is one people stop
// trying at. Every Monday everybody is level.
//
// Pure — dates in as "YYYY-MM-DD" strings, no server imports, no clock.

import {
  addDays,
  earlierOf,
  inclusiveDays,
  laterOf,
  toKey,
  weekStartOf,
  type DateKey,
} from "@/lib/dateKeys";

export { weekStartOf };
export type { DateKey };

export interface MemberForLeaderboard {
  userId: string;
  name: string | null;
  /** When they joined the roster. Bounds how many nights they could have logged. */
  joinedOn: DateKey;
  /**
   * The dates of nights this athlete logged. Dates only — no durations, no
   * targets, nothing about the nights themselves. The caller must not pass
   * anything richer, because anything richer could end up in the response.
   */
  loggedDates: DateKey[];
}

export interface LeaderboardEntry {
  name: string;
  /** Nights they logged inside the window. */
  nightsLogged: number;
  /** Nights they could have logged: window days, from when they joined. */
  nightsPossible: number;
  /**
   * 0–100, or null when nothing was possible yet — a Monday, or an athlete who
   * joined today. Null rather than 0 because "hasn't had the chance" and
   * "had the chance and didn't" are different facts and only one is a miss.
   */
  rate: number | null;
  /** Their position, 1-based. Ties share a position. */
  position: number;
  /** True for the athlete reading it, so the UI can mark their own row. */
  isYou: boolean;
}

export interface Leaderboard {
  weekStart: DateKey;
  /** The last night that counts — yesterday, or the week's end if it has passed. */
  windowEnd: DateKey | null;
  entries: LeaderboardEntry[];
}

/**
 * The last night that can be counted.
 *
 * Yesterday, not today. A night is filed under the date it BEGINS — the same
 * convention the dashboard's morning card and lib/messaging/night.ts use — so
 * tonight has not happened yet and counting it would mark every athlete late
 * every single day.
 */
export function windowEndFor(today: DateKey, weekStart: DateKey): DateKey | null {
  const yesterday = addDays(today, -1);
  // Sunday of the leaderboard's week, for a window being read after it ended.
  const weekEnd = addDays(weekStart, 6);
  const end = earlierOf(yesterday, weekEnd);
  // On a Monday, yesterday is last week's Sunday: nothing in this week has
  // finished yet, so there is nothing to rank.
  return end < weekStart ? null : end;
}

/**
 * Builds the board.
 *
 * `today` is a parameter rather than read from a clock so the week rollover,
 * the Monday empty state, and a mid-week join are all testable.
 */
export function buildLeaderboard(input: {
  members: MemberForLeaderboard[];
  viewerUserId: string;
  today: DateKey;
}): Leaderboard {
  const weekStart = weekStartOf(input.today);
  const windowEnd = windowEndFor(input.today, weekStart);

  const scored = input.members.map((member) => {
    // An athlete who joined on Wednesday is not behind for Monday and Tuesday.
    // Without this the newest member of every team starts at the bottom, which
    // is the opposite of what a joining experience should do.
    const from = laterOf(weekStart, member.joinedOn);
    const nightsPossible =
      windowEnd === null || windowEnd < from ? 0 : inclusiveDays(from, windowEnd);

    const nightsLogged =
      nightsPossible === 0
        ? 0
        : new Set(
            member.loggedDates.filter((date) => date >= from && date <= windowEnd!),
          ).size;

    return {
      name: member.name ?? "Unnamed athlete",
      userId: member.userId,
      joinedOn: member.joinedOn,
      nightsLogged,
      nightsPossible,
      rate: nightsPossible === 0 ? null : Math.round((nightsLogged / nightsPossible) * 100),
      isYou: member.userId === input.viewerUserId,
    };
  });

  scored.sort((a, b) => {
    // Athletes with no nights available yet sit at the bottom rather than at
    // 0% — they have not missed anything.
    if (a.rate === null && b.rate === null) return a.joinedOn.localeCompare(b.joinedOn);
    if (a.rate === null) return 1;
    if (b.rate === null) return -1;

    if (b.rate !== a.rate) return b.rate - a.rate;
    // A 5-of-5 week is a better week than 1-of-1, so more nights breaks a tie.
    if (b.nightsLogged !== a.nightsLogged) return b.nightsLogged - a.nightsLogged;
    // Then roster order. Deliberately nothing performance-shaped — there is no
    // third criterion here that could smuggle in a sleep value.
    return a.joinedOn.localeCompare(b.joinedOn);
  });

  const entries: LeaderboardEntry[] = [];
  let previous: { rate: number | null; nightsLogged: number } | null = null;
  let position = 0;

  scored.forEach((entry, index) => {
    // Ties share a position: two athletes both at 5 of 5 are not first and
    // second, they are both first. Standard competition ranking, so the next
    // athlete takes the position their index implies.
    const tied =
      previous !== null &&
      previous.rate === entry.rate &&
      previous.nightsLogged === entry.nightsLogged;
    if (!tied) position = index + 1;
    previous = { rate: entry.rate, nightsLogged: entry.nightsLogged };

    entries.push({
      name: entry.name,
      nightsLogged: entry.nightsLogged,
      nightsPossible: entry.nightsPossible,
      rate: entry.rate,
      position,
      isYou: entry.isYou,
    });
  });

  return { weekStart, windowEnd, entries };
}
