// Calendar-date arithmetic on "YYYY-MM-DD" strings.
//
// Extracted because three separate features grew identical copies of it: the
// consistency leaderboard, the check-in streak, and the retention cohorts. All
// three answer questions about days rather than instants, and all three broke
// in the same way when the arithmetic was done on Date objects in local time.
//
// ── Why UTC, always ─────────────────────────────────────────────────────────
//
// SleepLog.date is stored as UTC midnight standing for a local calendar date.
// Reading one of those rows in any other zone shifts the night into the
// neighbouring day, which for a streak invents or erases a break, for a
// leaderboard moves a night across a week boundary, and for a cohort moves a
// signup into the wrong week. Doing every calculation in UTC means the
// arithmetic matches the storage exactly.

/** A calendar date, "YYYY-MM-DD". */
export type DateKey = string;

export function toUtc(date: DateKey): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

export function toKey(date: Date): DateKey {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: DateKey, days: number): DateKey {
  const d = toUtc(date);
  d.setUTCDate(d.getUTCDate() + days);
  return toKey(d);
}

/** Whole days from `earlier` to `later`. Positive when `later` is later. */
export function daysBetween(earlier: DateKey, later: DateKey): number {
  return Math.round((toUtc(later).getTime() - toUtc(earlier).getTime()) / 86_400_000);
}

/** Days from `from` to `to` counting both ends. Negative when `to` is earlier. */
export function inclusiveDays(from: DateKey, to: DateKey): number {
  return daysBetween(from, to) + 1;
}

/**
 * The Monday of the week `date` falls in.
 *
 * Monday because a training week starts on one. Sunday belongs to the week
 * that began six days ago, not the one starting tomorrow: getting that
 * backwards gives every athlete a one-day week every Sunday.
 */
export function weekStartOf(date: DateKey): DateKey {
  const dayOfWeek = toUtc(date).getUTCDay(); // 0 = Sunday
  return addDays(date, -((dayOfWeek + 6) % 7));
}

export function laterOf(a: DateKey, b: DateKey): DateKey {
  return a >= b ? a : b;
}

export function earlierOf(a: DateKey, b: DateKey): DateKey {
  return a <= b ? a : b;
}

/** Today, as the UTC calendar date the stored rows are keyed by. */
export function todayKey(now: Date = new Date()): DateKey {
  return toKey(now);
}
