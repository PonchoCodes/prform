// The team's week-by-week record, as three rates and a count.
//
//   compliance   athlete-nights where the plan's target was hit, over
//                athlete-nights logged with a verdict
//   loggingRate  athlete-nights logged, over athlete-nights possible
//   shortNights  athlete-nights that missed their target by the exception
//                list's margin (lib/team/status.ts)
//
// Weeks are Monday to Sunday, the same week the leaderboard resets on, and
// the current week runs to last night. Hard team sessions are carried per
// week as dates so the chart can put them under the lines: the question a
// coach brings to this chart is whether their own calendar is what costs
// the compliance, and that is only answerable with both on one axis.
//
// The input carries hours — that is how a short night is decided — and the
// output carries none. teamTrend.test.ts walks the whole payload through
// lib/team/coachCopyGuard.ts.
//
// Pure — dates in as "YYYY-MM-DD", no server imports, no clock.

import {
  addDays,
  earlierOf,
  inclusiveDays,
  laterOf,
  weekStartOf,
  type DateKey,
} from "@/lib/dateKeys";
import { isShortNight, type NightForStatus } from "@/lib/team/status";

export interface MemberForTrend {
  userId: string;
  name: string;
  joinedOn: DateKey;
}

export interface NightForTrend extends NightForStatus {
  userId: string;
  hitTarget?: boolean | null;
}

export interface TeamTrendWeek {
  weekStart: DateKey;
  /** 0–100, or null when no night in the week carried a verdict. */
  compliance: number | null;
  /** 0–100, or null when no night was possible (nobody had joined yet). */
  loggingRate: number | null;
  shortNights: number;
  nightsLogged: number;
  nightsPossible: number;
  /** Dates of the team's hard sessions that week. */
  hardSessionDays: DateKey[];
}

export interface TeamTrendAthlete {
  name: string;
  compliance: number | null;
  loggingRate: number | null;
  shortNights: number;
  nightsLogged: number;
  nightsPossible: number;
}

export interface TeamTrend {
  /** Oldest first; the last entry is the current, partial week. */
  weeks: TeamTrendWeek[];
  /** Every athlete, for the current week. */
  athletes: TeamTrendAthlete[];
  /** Athlete-nights logged across the whole window. */
  nightsLogged: number;
  ready: boolean;
  nightsNeeded: number;
}

/** Athlete-nights across the team before a weekly rate means anything. */
export const MIN_TEAM_NIGHTS = 14;

export const DEFAULT_WEEKS = 8;

function pct(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : Math.round((numerator / denominator) * 100);
}

interface Tally {
  logged: number;
  possible: number;
  verdicts: number;
  hit: number;
  short: number;
}

function emptyTally(): Tally {
  return { logged: 0, possible: 0, verdicts: 0, hit: 0, short: 0 };
}

function addNight(t: Tally, n: NightForTrend): void {
  t.logged++;
  if (n.needsReview) return;
  if (n.hitTarget != null) {
    t.verdicts++;
    if (n.hitTarget) t.hit++;
  }
  if (isShortNight(n)) t.short++;
}

export function buildTeamTrend(input: {
  members: MemberForTrend[];
  nights: NightForTrend[];
  hardSessionDates: DateKey[];
  today: DateKey;
  weeks?: number;
}): TeamTrend {
  const weekCount = input.weeks ?? DEFAULT_WEEKS;
  const currentWeekStart = weekStartOf(input.today);
  const lastNight = addDays(input.today, -1);
  const firstWeekStart = addDays(currentWeekStart, -7 * (weekCount - 1));

  const nightsByUser = new Map<string, NightForTrend[]>();
  for (const n of input.nights) {
    if (n.date < firstWeekStart || n.date > lastNight) continue;
    const list = nightsByUser.get(n.userId);
    if (list) list.push(n);
    else nightsByUser.set(n.userId, [n]);
  }

  const weeks: TeamTrendWeek[] = [];
  let totalLogged = 0;

  for (let w = 0; w < weekCount; w++) {
    const weekStart = addDays(firstWeekStart, 7 * w);
    const weekEnd = earlierOf(addDays(weekStart, 6), lastNight);
    const tally = emptyTally();

    for (const member of input.members) {
      const from = laterOf(weekStart, member.joinedOn);
      if (from <= weekEnd) tally.possible += inclusiveDays(from, weekEnd);
      for (const n of nightsByUser.get(member.userId) ?? []) {
        if (n.date >= from && n.date <= weekEnd) addNight(tally, n);
      }
    }
    totalLogged += tally.logged;

    weeks.push({
      weekStart,
      compliance: pct(tally.hit, tally.verdicts),
      loggingRate: pct(tally.logged, tally.possible),
      shortNights: tally.short,
      nightsLogged: tally.logged,
      nightsPossible: tally.possible,
      hardSessionDays: input.hardSessionDates
        .filter((d) => d >= weekStart && d <= addDays(weekStart, 6))
        .sort(),
    });
  }

  const athletes: TeamTrendAthlete[] = input.members.map((member) => {
    const tally = emptyTally();
    const from = laterOf(currentWeekStart, member.joinedOn);
    if (from <= lastNight) tally.possible = inclusiveDays(from, lastNight);
    for (const n of nightsByUser.get(member.userId) ?? []) {
      if (n.date >= from && n.date <= lastNight) addNight(tally, n);
    }
    return {
      name: member.name,
      compliance: pct(tally.hit, tally.verdicts),
      loggingRate: pct(tally.logged, tally.possible),
      shortNights: tally.short,
      nightsLogged: tally.logged,
      nightsPossible: tally.possible,
    };
  });

  const nightsNeeded = Math.max(0, MIN_TEAM_NIGHTS - totalLogged);

  return {
    weeks,
    athletes,
    nightsLogged: totalLogged,
    ready: nightsNeeded === 0,
    nightsNeeded,
  };
}

/** What to show under the minimum. Always a count that goes down. */
export function teamTrendCountdownCopy(trend: TeamTrend): string {
  if (trend.ready) return "Your team trend is ready.";
  return `${trend.nightsNeeded} more logged night${trend.nightsNeeded === 1 ? "" : "s"} across the team and the trend appears.`;
}
