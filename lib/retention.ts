// Retention measurement, computed from our own database.
//
// ── Why there is no third-party analytics here ──────────────────────────────
//
// The people this product measures are mostly minors. Behavioural data about a
// sixteen-year-old's sleep habits, shipped to a vendor whose retention policy
// and sub-processor list we do not control, is not a thing to do casually and
// is not made acceptable by the vendor being popular. Everything below is
// computed from rows we already hold, for one admin, on request.
//
// The practical cost is that this file has to define its own metrics, so each
// one is written down here with what it counts and what it deliberately does
// not. That is a feature: "weekly active" means something specific and the
// definition is in the same file as the arithmetic.
//
// Pure — rows in, numbers out, `today` a parameter. No prisma, no clock.

import { addDays, daysBetween, toKey, weekStartOf, type DateKey } from "@/lib/dateKeys";

// ── inputs ──────────────────────────────────────────────────────────────────

export interface UserForRetention {
  id: string;
  /** Signup date. Decides which cohort they belong to, forever. */
  createdOn: DateKey;
  /** Null when onboarding was never finished. */
  onboardingCompletedOn: DateKey | null;
  /** Dates of every night they have logged. Dates only. */
  loggedDates: DateKey[];
  /**
   * Teams they are an ACTIVE member of. Empty means solo, which is its own
   * bucket rather than an absence — comparing a team against solo users is the
   * question the per-team rollup exists to answer.
   */
  teamIds: string[];
}

// ── the funnel ──────────────────────────────────────────────────────────────

/**
 * How far into their fourth week an athlete has to log something to count as
 * still there. Days 21 to 27 after signup, inclusive.
 *
 * "Four weeks" as a funnel step has to mean "still logging a month in", not
 * "survived four weeks on the calendar" — the second is satisfied by an account
 * that signed up and never returned.
 */
const FOURTH_WEEK_FROM = 21;
const FOURTH_WEEK_TO = 27;

/** A run this long counts as the habit having formed. */
const CONSECUTIVE_TARGET = 7;

export interface CohortFunnel {
  /** Monday of the signup week. */
  weekStart: DateKey;
  signedUp: number;
  completedOnboarding: number;
  firstSleepLog: number;
  sevenConsecutiveDays: number;
  fourWeeks: number;
  /**
   * False while the cohort is younger than four weeks, so a cohort that has not
   * had time to reach the last step is never read as one that failed to.
   */
  fourWeeksMeasurable: boolean;
}

/**
 * The longest run of consecutive logged dates.
 *
 * Strict: no forgiveness, no holds. This is measurement, not motivation. The
 * athlete-facing streak is generous on purpose (lib/streak.ts); a retention
 * number that inherited that generosity would report a habit that had not
 * formed, and the whole point of this page is to find out whether it has.
 */
export function longestConsecutiveRun(dates: DateKey[]): number {
  if (dates.length === 0) return 0;
  const sorted = Array.from(new Set(dates)).sort();

  let best = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    run = daysBetween(sorted[i - 1], sorted[i]) === 1 ? run + 1 : 1;
    if (run > best) best = run;
  }
  return best;
}

/** Whether they logged anything in days 21 to 27 after signing up. */
export function activeInFourthWeek(user: UserForRetention): boolean {
  const from = addDays(user.createdOn, FOURTH_WEEK_FROM);
  const to = addDays(user.createdOn, FOURTH_WEEK_TO);
  return user.loggedDates.some((d) => d >= from && d <= to);
}

/**
 * The signup funnel, one row per signup week.
 *
 * Every step is a subset of the one above it by construction: an athlete who
 * logged a night but skipped onboarding still counts at the onboarding step,
 * because a funnel whose steps can cross over is one nobody can read.
 */
export function buildCohorts(users: UserForRetention[], today: DateKey): CohortFunnel[] {
  const byWeek = new Map<DateKey, UserForRetention[]>();
  for (const user of users) {
    const week = weekStartOf(user.createdOn);
    const list = byWeek.get(week);
    if (list) list.push(user);
    else byWeek.set(week, [user]);
  }

  return Array.from(byWeek.entries())
    .sort((a, b) => b[0].localeCompare(a[0])) // newest cohort first
    .map(([weekStart, cohort]) => {
      const onboarded = cohort.filter((u) => u.onboardingCompletedOn !== null);
      const logged = onboarded.filter((u) => u.loggedDates.length > 0);
      const habitual = logged.filter(
        (u) => longestConsecutiveRun(u.loggedDates) >= CONSECUTIVE_TARGET,
      );
      const stillHere = logged.filter(activeInFourthWeek);

      return {
        weekStart,
        signedUp: cohort.length,
        completedOnboarding: onboarded.length,
        firstSleepLog: logged.length,
        sevenConsecutiveDays: habitual.length,
        fourWeeks: stillHere.length,
        // The whole cohort has to be old enough, and the cohort's youngest
        // member signed up on the Sunday of that week.
        fourWeeksMeasurable: daysBetween(addDays(weekStart, 6), today) >= FOURTH_WEEK_TO,
      };
    });
}

// ── weekly active ───────────────────────────────────────────────────────────

export interface WeeklyActive {
  weekStart: DateKey;
  /**
   * Athletes who logged at least one night that week.
   *
   * Not page views, not sessions, not opens. Someone who loads the dashboard
   * every morning and never logs a night has not used this product; a number
   * that counted them would say the opposite and would be the most flattering
   * metric on the page.
   */
  active: number;
}

export function buildWeeklyActive(
  users: UserForRetention[],
  today: DateKey,
  weeks: number,
): WeeklyActive[] {
  const thisWeek = weekStartOf(today);
  const out: WeeklyActive[] = [];

  for (let i = 0; i < weeks; i++) {
    const weekStart = addDays(thisWeek, -7 * i);
    const weekEnd = addDays(weekStart, 6);
    const active = users.filter((u) =>
      u.loggedDates.some((d) => d >= weekStart && d <= weekEnd),
    ).length;
    out.push({ weekStart, active });
  }

  return out;
}

// ── per-team rollups ────────────────────────────────────────────────────────

export interface GroupRollup {
  /** Team id, or null for the solo bucket. */
  teamId: string | null;
  label: string;
  members: number;
  /** Members who have logged at least one night, ever. */
  everLogged: number;
  /** Members who logged at least one night in the last seven days. */
  activeThisWeek: number;
  /** Members whose longest strict run reached seven days. */
  habitFormed: number;
  /** Mean nights logged in the last 28 days, one decimal place. */
  avgNightsLast28: number;
}

/**
 * One row per team, plus a row for solo users.
 *
 * An athlete on two teams is counted in both, which is right: the question is
 * "how is this team doing", and they are on it. The solo bucket is exactly the
 * users on no team, so the buckets are not a partition and the totals are not
 * expected to add up to the user count.
 */
export function buildGroupRollups(
  users: UserForRetention[],
  teamNames: Map<string, string>,
  today: DateKey,
): GroupRollup[] {
  const weekAgo = addDays(today, -7);
  const monthAgo = addDays(today, -28);

  const summarize = (label: string, teamId: string | null, members: UserForRetention[]) => {
    const nights = members.map(
      (u) => u.loggedDates.filter((d) => d >= monthAgo && d <= today).length,
    );
    return {
      teamId,
      label,
      members: members.length,
      everLogged: members.filter((u) => u.loggedDates.length > 0).length,
      activeThisWeek: members.filter((u) => u.loggedDates.some((d) => d >= weekAgo)).length,
      habitFormed: members.filter(
        (u) => longestConsecutiveRun(u.loggedDates) >= CONSECUTIVE_TARGET,
      ).length,
      avgNightsLast28:
        members.length === 0
          ? 0
          : Math.round((nights.reduce((a, b) => a + b, 0) / members.length) * 10) / 10,
    };
  };

  const rows: GroupRollup[] = [];
  for (const [teamId, name] of Array.from(teamNames.entries())) {
    rows.push(summarize(name, teamId, users.filter((u) => u.teamIds.includes(teamId))));
  }
  rows.sort((a, b) => b.members - a.members);

  rows.push(summarize("Solo (no team)", null, users.filter((u) => u.teamIds.length === 0)));
  return rows;
}

/** `Date` to the UTC calendar date the stored rows are keyed by. */
export function dateKeyOf(date: Date): DateKey {
  return toKey(date);
}
