// The one sentence the dashboard leads with: what to do about today's run.
//
// Everything here is derived from signals that already exist — the resolved
// pace table, the sleep plan's recovery score, training-stress balance, logged
// sleep, and meet proximity. There is deliberately no new composite readiness
// score: the app already asks the athlete to hold too many numbers in their
// head, and a verdict's job is to collapse them, not add one more.
//
// No server imports, so this is safe in client components.

import type { PaceTable, PaceSourceKind } from "@/lib/vdot";
import { formatPace, type UnitPreference } from "@/lib/unitUtils";

/**
 * Which branch produced the verdict. Exposed so the UI can style a race day
 * differently from a recovery day without re-deriving the reasoning, and so
 * tests can assert on the branch rather than on copy.
 */
export type VerdictKind =
  | "short_night"
  | "needs_pr"
  | "race_day"
  | "race_tomorrow"
  | "back_off"
  | "recover"
  | "taper"
  | "go_hard"
  | "threshold"
  | "easy";

export type VerdictConfidence = "high" | "medium" | "low";

export interface VerdictAction {
  label: string;
  /** `pr` opens the existing PrPrompt flow in place; the rest are hrefs. */
  target: "pr" | "strava" | "log_sleep";
}

export interface Verdict {
  kind: VerdictKind;
  /**
   * One imperative sentence about today's run. Always contains a number — see
   * `verdict.test.ts`. Deliberately says nothing about bedtime: the headline
   * carries one instruction, and tonight's target is rendered once, elsewhere.
   */
  verdict: string;
  /** One clause explaining why. */
  reason: string;
  confidence: VerdictConfidence;
  /**
   * Substrings of `verdict` that must never break across lines — pace ranges,
   * paces, clock times. The headline is set in monospace at display sizes, so
   * a break inside "8:05–8:54/mi" is both likely and unreadable. Kept as tokens
   * rather than markup so `verdict` stays a plain, assertable string.
   */
  nowrap: string[];
  /** Present when the athlete can materially improve the verdict. */
  action?: VerdictAction;
}

export interface VerdictInput {
  /** Resolved pace table, or null when no VDOT could be established. */
  paces: PaceTable | null;
  paceSourceKind: PaceSourceKind;
  unit: UnitPreference;

  stravaConnected: boolean;

  /**
   * From today's DailySleepPlan. Bedtime and wake time are deliberately absent:
   * they belong to Tonight's Target, which renders them once. The verdict only
   * needs the hours, and only for the state where no pace exists.
   */
  totalSleepHours: number;
  /**
   * How far tonight's prescription falls short of `totalSleepHours`, in
   * minutes, once the wake time the athlete declared has been accounted for.
   * Null when nothing has been declared and the plan is working from their
   * default, which is the ordinary case.
   *
   * A duration rather than a clock time, deliberately: this module still says
   * nothing about when to go to bed, and a shortfall is a quantity the verdict
   * can reason about without becoming a second place that prints a bedtime.
   */
  sleepShortfallMinutes: number | null;
  /** What tonight actually allows, against the target. Null when unknown. */
  achievableSleepHours: number | null;
  recoveryScore: number;
  trainingLoadLevel: "low" | "medium" | "high";
  /** Tomorrow's planned load. Changes why today is easy, never whether it is. */
  tomorrowLoadLevel: "low" | "medium" | "high" | null;
  daysUntilNextMeet: number | null;
  nextMeetName: string | null;
  nextMeetPriority: "A" | "B" | "C" | null;

  /** Training stress balance; null when there is no Strava history to compute it. */
  tsb: number | null;
  /** Cumulative minutes of sleep missed across the recent window; null when unlogged. */
  sleepDebtMinutes: number | null;
  /** Confirmed sleep logs in the recent window — drives confidence, not the verdict. */
  nightsLogged: number;
}

// ── thresholds ───────────────────────────────────────────────────────────────

/** An hour down is where the sleep-extension literature starts showing pace cost. */
const SLEEP_DEBT_MINUTES = 60;
/** Recovery score below this reads as accumulated autonomic load, not a bad night. */
const RECOVERY_FATIGUED = 60;
/** TSB this negative means fatigue is outrunning fitness. */
const TSB_FATIGUED = -15;
/** Inside this window before an A/B meet, volume should be coming down. */
const TAPER_WINDOW_DAYS = 7;
/** Confirmed nights needed before sleep-derived reasoning is trustworthy. */
const CONFIDENT_NIGHTS = 5;

/**
 * How short tonight has to be before the verdict is about the night rather
 * than the run. Deliberately the same hour as SLEEP_DEBT_MINUTES: the two are
 * different signals — one is a deficit already accumulated, the other a deficit
 * arriving tonight — and having them disagree about what counts as an hour down
 * would put the athlete either side of two different lines for the same amount
 * of lost sleep.
 */
const SHORTFALL_MINUTES = SLEEP_DEBT_MINUTES;

/**
 * A night has to be meaningfully short before it counts. Fifteen minutes is
 * inside the noise of self-reported bedtimes and would otherwise accumulate
 * into a debt the athlete doesn't feel.
 */
const DEBT_DEADBAND_MINUTES = 15;

// ── sleep debt ───────────────────────────────────────────────────────────────

export interface SleepDebtLog {
  /** The plan's target for that night, frozen at log time. Absent on older rows. */
  targetSleepHours?: number | null;
  actualSleepHours?: number | null;
  recommendedBedtime?: string | null;
  actualBedtime?: string | null;
  hitTarget?: boolean | null;
}

function minutesOf(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Shortfall for one night in minutes, or null if the night can't be scored. */
function nightShortfall(log: SleepDebtLog): number | null {
  // Preferred: hours actually slept against the target for that night. Only
  // available for nights logged after the target columns shipped.
  if (log.targetSleepHours != null && log.actualSleepHours != null) {
    return (log.targetSleepHours - log.actualSleepHours) * 60;
  }
  // Fallback: how late to bed against that night's target, which is the same
  // signal the recovery score and the intervention card already use.
  if (log.hitTarget === true) return 0;
  if (log.actualBedtime && log.recommendedBedtime) {
    let dev = minutesOf(log.actualBedtime) - minutesOf(log.recommendedBedtime);
    if (dev > 720) dev -= 1440;
    if (dev < -720) dev += 1440;
    return dev;
  }
  return null;
}

/**
 * Accumulated sleep debt across the supplied nights, in minutes. Null when no
 * night can be scored — the caller must then say it has no sleep data rather
 * than report a debt of zero, which would read as "you're fine".
 *
 * Only shortfalls accumulate. A long night is not treated as repaying an
 * earlier short one: recovery sleep restores less than hour-for-hour, and
 * showing debt cancelled by one lie-in would overstate how recovered the
 * athlete is on exactly the day they most need the warning.
 */
export function computeSleepDebtMinutes(logs: SleepDebtLog[]): number | null {
  let total = 0;
  let scored = 0;

  for (const log of logs) {
    const shortfall = nightShortfall(log);
    if (shortfall == null) continue;
    scored++;
    if (shortfall > DEBT_DEADBAND_MINUTES) total += shortfall;
  }

  return scored === 0 ? null : Math.round(total);
}

// ── formatting ───────────────────────────────────────────────────────────────

/**
 * "8:45/mi" — the space before the unit is closed up. In the headline the pace
 * is one token the eye reads whole, and a space is a break opportunity.
 */
function pace(speedMs: number, unit: UnitPreference): string {
  return formatPace(speedMs, unit).replace(" /", "/");
}

/** "8:45–9:30/mi" — the unit is stated once, at the end. */
function paceRange(fastMs: number, slowMs: number, unit: UnitPreference): string {
  const suffix = unit === "imperial" ? "/mi" : "/km";
  return `${pace(fastMs, unit).replace(suffix, "")}–${pace(slowMs, unit)}`;
}

/**
 * "3 hours" / "2.5 hours" / "30 minutes" — a shortfall at the precision it is
 * actually known to.
 *
 * Rounded to the half hour on purpose. The number comes from a sleep need
 * derived from age brackets and training load, against a bedtime clamped by two
 * separate limits; reporting "3h17m short" would claim a precision the model
 * does not have, and an athlete reading it would reasonably start arguing with
 * the seventeen.
 */
export function formatShortfall(minutes: number): string {
  const halfHours = Math.round(Math.max(0, minutes) / 30);
  if (halfHours === 0) return "0 minutes";
  if (halfHours === 1) return "30 minutes";
  const hours = halfHours / 2;
  if (hours === 1) return "1 hour";
  return `${hours % 1 === 0 ? hours : hours.toFixed(1)} hours`;
}

/** "2h10" / "45min" — how far down the athlete is, in words they'd use. */
export function formatSleepDebt(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  if (total < 60) return `${total}min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}

// ── reasoning ────────────────────────────────────────────────────────────────

/**
 * The single dominant reason to hold back, or null if nothing is flagging.
 * Ordered by how directly the athlete can act on it: sleep is a choice they
 * make tonight, recovery and TSB are consequences they can only wait out.
 */
function fatigueReason(input: VerdictInput): string | null {
  const { sleepDebtMinutes, recoveryScore, tsb } = input;

  if (sleepDebtMinutes != null && sleepDebtMinutes >= SLEEP_DEBT_MINUTES) {
    return `You're ${formatSleepDebt(sleepDebtMinutes)} down on sleep this week.`;
  }
  if (recoveryScore < RECOVERY_FATIGUED) {
    return `Recovery is ${recoveryScore}/100 — the load from the last few days hasn't cleared.`;
  }
  if (tsb != null && tsb < TSB_FATIGUED) {
    return `Your training stress balance is ${tsb} — fatigue is outrunning fitness.`;
  }
  return null;
}

function confidenceFor(input: VerdictInput): VerdictConfidence {
  if (!input.paces) return "low";
  if (input.paceSourceKind === "observed" && input.nightsLogged === 0) return "low";
  if (input.nightsLogged < CONFIDENT_NIGHTS) return "medium";
  if (input.paceSourceKind === "none") return "low";
  return "high";
}

/** Nudges toward whatever would most improve tomorrow's verdict. */
function actionFor(input: VerdictInput): VerdictAction | undefined {
  if (!input.paces) {
    return { label: "Add a race PR", target: "pr" };
  }
  if (input.nightsLogged === 0) {
    return { label: "Log last night's sleep", target: "log_sleep" };
  }
  if (!input.stravaConnected) {
    return { label: "Connect Strava", target: "strava" };
  }
  return undefined;
}

// ── the ladder ───────────────────────────────────────────────────────────────

/**
 * Resolves the day to one instruction. Branches are evaluated in order and the
 * first match wins, so the ordering encodes the priority: a race outranks
 * fatigue, fatigue outranks the planned session, and the planned session
 * outranks the default.
 */
export function computeVerdict(input: VerdictInput): Verdict {
  const {
    paces,
    unit,
    totalSleepHours,
    trainingLoadLevel,
    daysUntilNextMeet,
    nextMeetName,
    nextMeetPriority,
  } = input;

  const confidence = confidenceFor(input);
  const action = actionFor(input);
  const fatigue = fatigueReason(input);
  const meetLabel = nextMeetName ?? "your next meet";

  // Above everything, including race day and the no-PR state.
  //
  // The athlete has told us when they are getting up, and that time makes
  // tonight's target unreachable — not unlikely, unreachable, because the
  // bedtime it would require is one the plan is not allowed to prescribe. Every
  // branch below assumes a night that can still go either way, so any of them
  // running here would print an instruction built on sleep that is not
  // available. The no-PR branch is the sharpest case: its headline is a sleep
  // target, and it would be stating a number we already know cannot happen.
  //
  // It outranks race day because a 03:00 wake before a race is exactly when the
  // honest version matters most, and because saying it does not stop the athlete
  // racing — it changes what they should expect and what tomorrow should hold.
  if (
    input.sleepShortfallMinutes != null &&
    input.sleepShortfallMinutes >= SHORTFALL_MINUTES
  ) {
    const short = formatShortfall(input.sleepShortfallMinutes);
    const available =
      input.achievableSleepHours != null ? `${input.achievableSleepHours}h` : null;

    return {
      kind: "short_night",
      verdict: `You'll be about ${short} short tonight.`,
      reason: available
        ? `The wake time you gave leaves ${available} against a ${totalSleepHours}h target. Move tomorrow's threshold or make it aerobic — on that much sleep the session costs more than it returns.`
        : `Tonight's target can't be reached from the wake time you gave. Move tomorrow's threshold or make it aerobic — on that much sleep the session costs more than it returns.`,
      // Only the headline's own tokens: `nowrap` is defined as substrings of
      // `verdict`, and the hours in the reason are set at body size where a
      // line break is harmless.
      nowrap: [short],
      confidence,
      action,
    };
  }

  // No VDOT resolvable, so there is no run instruction to give. Tonight's sleep
  // is the only thing that can still be prescribed, so it takes the headline —
  // the single state where the headline is not about the run.
  if (!paces) {
    return {
      kind: "needs_pr",
      verdict: `Sleep ${totalSleepHours}h tonight.`,
      reason: input.stravaConnected
        ? "Add a race PR and this becomes a pace for today's run, not just a sleep target."
        : "Add a race PR or connect Strava to get today's prescribed paces.",
      nowrap: [`${totalSleepHours}h`],
      confidence,
      action,
    };
  }

  const easy = paceRange(paces.easyFastPaceMs, paces.easySlowPaceMs, unit);
  const threshold = pace(paces.thresholdPaceMs, unit);
  const interval = pace(paces.intervalPaceMs, unit);

  if (daysUntilNextMeet === 0) {
    return {
      kind: "race_day",
      verdict: `Race today — shake out at ${easy}.`,
      reason: `${meetLabel} is today. Everything that decides it has already happened.`,
      nowrap: [easy],
      confidence,
      action,
    };
  }

  if (daysUntilNextMeet === 1) {
    return {
      kind: "race_tomorrow",
      verdict: `Rest, or 20 easy minutes at ${easy}.`,
      reason: `${meetLabel} is tomorrow. Tonight's sleep is the last thing that still moves the result.`,
      nowrap: [easy],
      confidence,
      action,
    };
  }

  // The case the product exists for: a hard session is on the calendar and the
  // athlete is not in a state to absorb it.
  if (fatigue && trainingLoadLevel === "high") {
    return {
      kind: "back_off",
      verdict: `Run easy today — ${easy}.`,
      reason: `${fatigue} Today's hard session will cost more than it returns.`,
      nowrap: [easy],
      confidence,
      action,
    };
  }

  if (fatigue) {
    return {
      kind: "recover",
      verdict: `Keep today easy — ${easy}.`,
      reason: `${fatigue} Tonight's target below is how you get out of it.`,
      nowrap: [easy],
      confidence,
      action,
    };
  }

  if (
    daysUntilNextMeet != null &&
    daysUntilNextMeet <= TAPER_WINDOW_DAYS &&
    (nextMeetPriority === "A" || nextMeetPriority === "B")
  ) {
    return {
      kind: "taper",
      verdict: `Cut the volume — ${easy}.`,
      reason: `${meetLabel} is ${daysUntilNextMeet} days out. The fitness is already banked; sharpness isn't — finish with a few strides at ${interval}.`,
      nowrap: [easy],
      confidence,
      action,
    };
  }

  if (trainingLoadLevel === "high") {
    return {
      kind: "go_hard",
      verdict: `Run today's intervals at ${interval}.`,
      reason: `Green light — recovery is ${input.recoveryScore}/100 and you're on target for sleep. Take the session.`,
      nowrap: [interval],
      confidence,
      action,
    };
  }

  if (trainingLoadLevel === "medium") {
    return {
      kind: "threshold",
      verdict: `Hold threshold at ${threshold} today.`,
      reason: `Recovery is ${input.recoveryScore}/100 — comfortably hard is the point, not racing it.`,
      nowrap: [threshold],
      confidence,
      action,
    };
  }

  return {
    kind: "easy",
    verdict: `Run easy today — ${easy}.`,
    nowrap: [easy],
    reason:
      input.tomorrowLoadLevel === "high"
        ? `Tomorrow is the hard session. Today's job is to arrive at it with recovery above ${input.recoveryScore}/100.`
        : `Nothing hard on the calendar and recovery is ${input.recoveryScore}/100. Bank the aerobic work.`,
    confidence,
    action,
  };
}
