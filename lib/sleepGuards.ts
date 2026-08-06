// What a night's signals add up to, and when they add up to nothing.
//
// Every rule here exists because the alternative is a plausible-looking wrong
// number. The sleep record feeds the trend chart, the recovery score and the
// verdict; a night that reads 27 hours because nobody replied would move all
// three, and would look exactly like data. Refusing to compute is always
// available and is usually the right answer.
//
// Pure — no server imports, no clock of its own. `now` is passed in.

export type GuardedSource = "TIMESTAMPED" | "INFERRED";

export type ReviewReason =
  /** Outside the window any real night falls in. */
  | "implausible_duration"
  /** Wake recorded at or before onset. */
  | "wake_before_onset"
  /** A second BED with no UP between: they got up in the middle. */
  | "split_night";

export type NightResolution =
  /** Scoreable. `minutes` is safe to store as a duration. */
  | { kind: "duration"; minutes: number; source: GuardedSource }
  /** Not scoreable. Flag the row; store no duration. */
  | { kind: "review"; reason: ReviewReason; note: string }
  /** Not enough signal yet. Leave the row alone and wait. */
  | { kind: "wait" };

/**
 * The window a real night falls in.
 *
 * Two hours excludes a nap and excludes the athlete who texts BED and UP within
 * the same hour by mistake. Fourteen hours is past what even a sick teenager
 * sleeps, and — more to the point — it is well under the 24 hours at which a
 * modular duration wraps around and starts looking normal again.
 */
export const MIN_SLEEP_MINUTES = 2 * 60;
export const MAX_SLEEP_MINUTES = 14 * 60;

/**
 * How long after the declared wake to wait for a signal before closing the
 * record ourselves. Two hours is long enough that an athlete who simply texts
 * late is not overwritten, and short enough that the night is closed before the
 * next one starts.
 */
export const INFERRED_GRACE_MINUTES = 2 * 60;

export function isPlausibleDuration(minutes: number): boolean {
  return minutes >= MIN_SLEEP_MINUTES && minutes <= MAX_SLEEP_MINUTES;
}

function minutesBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 60000);
}

/** "9h15" / "27h" / "45min" — for the review note, so a human can read it. */
export function describeDuration(minutes: number): string {
  const sign = minutes < 0 ? "-" : "";
  const total = Math.abs(Math.round(minutes));
  if (total < 60) return `${sign}${total}min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${sign}${h}h` : `${sign}${h}h${String(m).padStart(2, "0")}`;
}

export interface NightSignals {
  sleepOnsetAt: Date | null;
  wakeAt: Date | null;
  declaredWakeAt: Date | null;
}

/**
 * Resolves one night from whatever signals exist.
 *
 * Order matters. A real wake signal always beats the declared one — the point
 * of asking for UP is that it is observed rather than predicted. The declared
 * wake is only used once the grace period has passed, which is what stops a
 * night from staying open forever when nobody replies.
 */
export function resolveNight(signals: NightSignals, now: Date): NightResolution {
  const { sleepOnsetAt, wakeAt, declaredWakeAt } = signals;

  // No onset, nothing to measure from. A night nobody logged is missing, not
  // zero — the same distinction the trend chart already draws.
  if (!sleepOnsetAt) return { kind: "wait" };

  if (wakeAt) {
    const minutes = minutesBetween(sleepOnsetAt, wakeAt);
    if (minutes <= 0) {
      return {
        kind: "review",
        reason: "wake_before_onset",
        note: `wake ${wakeAt.toISOString()} is not after onset ${sleepOnsetAt.toISOString()}`,
      };
    }
    if (!isPlausibleDuration(minutes)) {
      return {
        kind: "review",
        reason: "implausible_duration",
        note: `${describeDuration(minutes)} between onset and wake is outside ${describeDuration(MIN_SLEEP_MINUTES)}–${describeDuration(MAX_SLEEP_MINUTES)}`,
      };
    }
    return { kind: "duration", minutes, source: "TIMESTAMPED" };
  }

  // No wake signal. Close at the declared wake once the grace period is up.
  if (declaredWakeAt) {
    const deadline = new Date(declaredWakeAt.getTime() + INFERRED_GRACE_MINUTES * 60000);
    if (now < deadline) return { kind: "wait" };

    const minutes = minutesBetween(sleepOnsetAt, declaredWakeAt);
    if (minutes <= 0) {
      return {
        kind: "review",
        reason: "wake_before_onset",
        note: `declared wake ${declaredWakeAt.toISOString()} is not after onset ${sleepOnsetAt.toISOString()}`,
      };
    }
    if (!isPlausibleDuration(minutes)) {
      // The case this whole module exists for: onset recorded, nobody ever
      // replied, and the arithmetic would otherwise produce a night long enough
      // to drag a fortnight of the trend line upward on its own.
      return {
        kind: "review",
        reason: "implausible_duration",
        note: `${describeDuration(minutes)} from onset to the declared wake is outside ${describeDuration(MIN_SLEEP_MINUTES)}–${describeDuration(MAX_SLEEP_MINUTES)}`,
      };
    }
    return { kind: "duration", minutes, source: "INFERRED" };
  }

  // Onset but no wake of any kind and nothing declared to fall back on. There
  // is no deadline to apply, so the row stays open rather than being closed at
  // an invented time.
  return { kind: "wait" };
}

/**
 * A second BED with no UP in between.
 *
 * This is one night with a hole in it, not two nights — the athlete went down,
 * got up to finish an essay, and went down again. Neither onset alone yields a
 * true total, and there is nowhere honest to put "minus the ninety minutes in
 * the middle", so the night is flagged instead of scored. The original onset is
 * kept: it is still true that the night began then, and both BED messages
 * survive verbatim in InboundMessage for anyone reconstructing it.
 */
export function isSplitNight(existing: NightSignals): boolean {
  return existing.sleepOnsetAt !== null && existing.wakeAt === null;
}

/**
 * A duration the athlete reported themselves, checked against the same window.
 * "About 18 hours" parses cleanly and is still not a night.
 */
export function guardRecalledDuration(minutes: number): NightResolution {
  if (!isPlausibleDuration(minutes)) {
    return {
      kind: "review",
      reason: "implausible_duration",
      note: `reported ${describeDuration(minutes)}, outside ${describeDuration(MIN_SLEEP_MINUTES)}–${describeDuration(MAX_SLEEP_MINUTES)}`,
    };
  }
  return { kind: "duration", minutes, source: "TIMESTAMPED" };
}
