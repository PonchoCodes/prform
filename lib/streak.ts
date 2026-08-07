// The check-in streak: consecutive days the athlete told us how they slept.
//
// ── What it counts, and the thing it must never count ───────────────────────
//
// Days checked in. Not targets hit. A teenager who stayed up until 1am
// finishing a lab report and logged it honestly at 6:30 the next morning has
// kept their streak — they did the thing the streak is for. Breaking it there
// would punish the one behaviour we actually want and teach them that the way
// to keep a streak is to stop reporting bad nights, which destroys the data
// the entire product runs on.
//
// This is deliberately a different quantity from `sleepStreak` in
// lib/sleepAlgorithm.ts, which counts consecutive nights that hit their target
// and feeds the recovery score. That one is physiology and stays as it is. This
// one is a habit, shown to the athlete. They are not interchangeable and should
// never be displayed under the same word.
//
// ── Two kinds of leniency, and they do different jobs ───────────────────────
//
// FORGIVENESS is automatic and retroactive: one skipped night per week, applied
// silently, no button. Rolling rather than calendar-week — a miss is forgiven
// only if no other miss was forgiven in the previous seven days. A
// calendar-week allowance would let a Sunday and a Monday both be forgiven, two
// nights in two days out of a promise that says one a week, and an athlete who
// noticed would rightly call it a lie. Two misses in a row therefore always
// break the streak, which is the intuition people already have about streaks.
//
// A HOLD is declared in advance by the athlete: a date range they will be away
// for. Held days are removed from the question entirely. They are not counted,
// not missed, and they do not consume the weekly forgiveness, so a fortnight in
// hospital leaves a 40-day streak at 40 rather than at zero.
//
// Forgiveness covers the night you did not see coming. A hold covers the
// fortnight you did. Neither is a currency: there is no balance, nothing to
// earn and nothing to spend, because a balance is a second thing to check and
// this product's whole messaging design is built on not being one more thing to
// check.
//
// A hold cannot be farmed, which is why it needs no limit. A held day is not a
// checked-in day either, so an athlete who marks every day as held has a streak
// of zero.
//
// Pure — dates in as "YYYY-MM-DD", `today` is a parameter, no clock, no
// server imports.

import { addDays, daysBetween, type DateKey } from "@/lib/dateKeys";

export type { DateKey };

/** How long before a forgiven miss frees up the next one. */
export const FORGIVENESS_INTERVAL_DAYS = 7;

/**
 * A ceiling on the backward walk, so a pathological history cannot spin. Two
 * years is far longer than any streak this product will see and far shorter
 * than a loop that matters.
 */
const MAX_WALK_DAYS = 730;

/** A stretch of days the athlete marked as away. Both ends inclusive. */
export interface HoldRange {
  startsOn: DateKey;
  endsOn: DateKey;
}

export interface CheckInStreak {
  /** Consecutive days checked in, with forgiven misses bridged. */
  current: number;
  /** The best run they have ever had, same rules applied historically. */
  longest: number;
  /** Misses bridged inside the current run — what forgiveness actually bought. */
  forgivenInCurrent: number;
  /**
   * True when last night has not been logged yet.
   *
   * Not the same as broken. Someone logs last night at 6:40am on their way to
   * practice; a streak that had already broken at midnight would be wrong for
   * the seven hours when they were asleep and could do nothing about it. The
   * day stays open, and the UI can nudge instead of mourn.
   */
  atRisk: boolean;
  /**
   * Whether a miss tonight would be bridged rather than break the run. Exposed
   * so the athlete can be told the truth about their own margin instead of
   * guessing at it.
   */
  canSkipTonight: boolean;
  /** Days inside the current run that were held rather than logged. */
  heldInCurrent: number;
  /** True when today itself falls inside a hold. */
  onHoldToday: boolean;
}

const EMPTY: CheckInStreak = {
  current: 0,
  longest: 0,
  forgivenInCurrent: 0,
  atRisk: false,
  canSkipTonight: true,
  heldInCurrent: 0,
  onHoldToday: false,
};

/**
 * The streak as of `today`.
 *
 * The window ends YESTERDAY, not today: a night is filed under the date it
 * begins, so tonight has not happened and counting it would show every athlete
 * one day short of their real streak, every day.
 */
export function computeCheckInStreak(input: {
  loggedDates: DateKey[];
  today: DateKey;
  /** Ranges the athlete marked as away. Optional; absent means none. */
  holds?: HoldRange[];
}): CheckInStreak {
  const logged = new Set(input.loggedDates);
  const holds = input.holds ?? [];
  const isHeld = (date: DateKey) =>
    holds.some((h) => date >= h.startsOn && date <= h.endsOn);

  const onHoldToday = isHeld(input.today);
  if (logged.size === 0) return { ...EMPTY, onHoldToday };

  const earliest = Array.from(logged).sort()[0];
  const yesterday = addDays(input.today, -1);

  // A held last night is not "at risk": there is nothing to log and nothing to
  // lose, and telling someone on a hospital ward to log last night to keep
  // their streak would be the app at its worst.
  const atRisk = !logged.has(yesterday) && !isHeld(yesterday);
  // When last night is still unlogged the day is open, so it is skipped rather
  // than counted as a miss — it costs neither a day nor a forgiveness.
  let cursor = atRisk ? addDays(yesterday, -1) : yesterday;

  let current = 0;
  let forgivenInCurrent = 0;
  let heldInCurrent = 0;
  let lastForgiven: DateKey | null = null;

  for (let steps = 0; steps < MAX_WALK_DAYS && cursor >= earliest; steps++) {
    if (logged.has(cursor)) {
      current++;
    } else if (isHeld(cursor)) {
      // Removed from the question entirely: not counted, not missed, and it
      // does not touch the weekly forgiveness. This is checked before
      // forgiveness so a declared absence never quietly spends the one skip the
      // athlete was saving for something they could not see coming.
      heldInCurrent++;
    } else if (
      lastForgiven === null ||
      daysBetween(cursor, lastForgiven) >= FORGIVENESS_INTERVAL_DAYS
    ) {
      // Bridged. A forgiven day does not add to the count — it buys continuity,
      // not credit for a night they did not report.
      lastForgiven = cursor;
      forgivenInCurrent++;
    } else {
      break;
    }
    cursor = addDays(cursor, -1);
  }

  return {
    current,
    longest: Math.max(current, longestRun(logged, earliest, yesterday, isHeld)),
    forgivenInCurrent,
    atRisk,
    canSkipTonight:
      lastForgiven === null ||
      daysBetween(lastForgiven, input.today) >= FORGIVENESS_INTERVAL_DAYS,
    heldInCurrent,
    onHoldToday,
  };
}

/**
 * The best run in the whole history, forgiveness applied the same way.
 *
 * Walks forward rather than backward so that each run's forgiveness budget
 * starts fresh where the run does — reusing the backward walk from every
 * possible start date would be quadratic and would get the budget wrong.
 */
function longestRun(
  logged: Set<DateKey>,
  earliest: DateKey,
  latest: DateKey,
  isHeld: (date: DateKey) => boolean,
): number {
  if (daysBetween(earliest, latest) < 0) return 0;

  let best = 0;
  let run = 0;
  let lastForgiven: DateKey | null = null;
  let cursor = earliest;

  for (let steps = 0; steps <= MAX_WALK_DAYS && cursor <= latest; steps++) {
    if (logged.has(cursor)) {
      run++;
      if (run > best) best = run;
    } else if (isHeld(cursor)) {
      // Skipped over, exactly as in the backward walk.
    } else if (
      lastForgiven === null ||
      daysBetween(lastForgiven, cursor) >= FORGIVENESS_INTERVAL_DAYS
    ) {
      lastForgiven = cursor;
    } else {
      run = 0;
      lastForgiven = null;
    }
    cursor = addDays(cursor, 1);
  }

  return best;
}

/**
 * How the streak is said out loud, in one short clause.
 *
 * Kept next to the calculation so the number and the sentence cannot drift, and
 * so both the dashboard and the morning message say the same thing.
 *
 * Silent below three days. A streak is a thing you are protecting, and telling
 * someone they have a one-day streak announces that they have nothing to
 * protect yet — the first two mornings are better spent on the verdict alone.
 */
export const STREAK_ANNOUNCE_FROM = 3;

export function streakSentence(streak: CheckInStreak): string | null {
  if (streak.current < STREAK_ANNOUNCE_FROM) return null;
  return `Day ${streak.current} of checking in.`;
}
