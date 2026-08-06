// Training load from a manual workout: duration × session RPE, put on the
// same scale as the device-derived stress it substitutes for.
//
// The model is Foster's session-RPE — the athlete rates the whole session 1–10
// once it's done, and minutes × rating is the load. It is the standard
// device-free load measure precisely because it needs nothing but a watch and
// honesty, and it tracks HR-based training impulse well enough that ATL/CTL
// arithmetic doesn't care which one fed it.
//
// The one modelling decision here is the normalization. calculatePMC counts in
// TSS, where one hour at threshold is 100 by definition. Threshold effort on
// the Foster scale is RPE 7 ("hard — one-word answers"), so one hour at RPE 7
// (420 Foster units) maps to 100 TSS, and everything else scales linearly:
//
//   tss = minutes × rpe × (100 / (60 × 7))
//
// Linear, not RPE², deliberately: Foster's validation is of the linear
// product, and squaring would punish easy volume — an hour's easy run at RPE 3
// would drop from ~43 TSS (in line with what HR-based TSS reports) to ~18,
// understating exactly the athletes this path exists for.
//
// No server imports. Pure.

/** One hour at threshold (RPE 7) ≡ 100 TSS. */
const TSS_PER_FOSTER_UNIT = 100 / (60 * 7);

/** The Foster scale is 1–10; anything else is a form bug, not a workout. */
export function isValidRpe(rpe: number): boolean {
  return Number.isInteger(rpe) && rpe >= 1 && rpe <= 10;
}

/**
 * Session-RPE load in Foster units (minutes × RPE), or null when the inputs
 * cannot describe a session. Null rather than 0: a zero would feed the PMC as
 * a real rest day, which is what the caller should decide, not this function.
 */
export function sessionRpeLoad(durationMinutes: number, rpe: number): number | null {
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) return null;
  // Longer than any training day; almost certainly minutes-vs-hours confusion.
  if (durationMinutes > 12 * 60) return null;
  if (!isValidRpe(rpe)) return null;
  return durationMinutes * rpe;
}

/** Session-RPE load expressed in TSS, for merging with device-derived stress. */
export function tssFromSessionRpe(durationMinutes: number, rpe: number): number | null {
  const load = sessionRpeLoad(durationMinutes, rpe);
  if (load === null) return null;
  return Math.round(load * TSS_PER_FOSTER_UNIT * 10) / 10;
}

export interface ManualWorkoutForLoad {
  date: Date;
  /** Minutes. */
  duration: number | null;
  /** Session RPE 1–10. */
  effort: number | null;
  isTemplate: boolean;
}

/**
 * Daily TSS from manual workouts, keyed "YYYY-MM-DD" (UTC slice, matching
 * every other date key in the app).
 *
 * `stravaDates` are days already covered by a synced activity. A manual
 * workout on such a day is skipped entirely rather than added: for athletes
 * with both sources it is almost always the same run logged twice, and
 * counting it twice would manufacture fatigue. Strava wins because it is the
 * same ground-truth-first rule the workout merge layer already applies.
 *
 * Template rows never contribute — they are a schedule, not something that
 * happened.
 */
export function manualDailyTss(
  workouts: ManualWorkoutForLoad[],
  stravaDates: ReadonlySet<string>,
): Map<string, number> {
  const byDate = new Map<string, number>();
  for (const w of workouts) {
    if (w.isTemplate) continue;
    if (w.duration == null || w.effort == null) continue;
    const tss = tssFromSessionRpe(w.duration, w.effort);
    if (tss === null) continue;
    const key = new Date(w.date).toISOString().slice(0, 10);
    if (stravaDates.has(key)) continue;
    byDate.set(key, (byDate.get(key) ?? 0) + tss);
  }
  return byDate;
}
