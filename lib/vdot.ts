// Daniels/Gilbert VDOT model — the single source of truth for pace derivation.
//
// Two regressions from Daniels & Gilbert, "Oxygen Power" (1979) underpin everything:
//
//   1. Oxygen cost of running at velocity v (m/min), in ml/kg/min:
//        VO2 = -4.60 + 0.182258·v + 0.000104·v²
//   2. Fraction of VO2max sustainable for a race lasting t minutes:
//        %max = 0.8 + 0.1894393·e^(-0.012778·t) + 0.2989558·e^(-0.1932605·t)
//
//   VDOT = VO2(race velocity) / %max(race duration)
//
// Training paces come from inverting regression 1 at a target %VO2max, NOT from
// scaling velocity linearly — the velocity/VO2 relationship is quadratic, so a
// linear approximation understates pace by 7–13% across the usable VDOT range.
//
// Marathon pace is derived by inverting the whole model at 42195 m rather than
// from a fixed %VO2max, because the sustainable fraction rises with fitness
// (~0.80 at VDOT 40 vs ~0.83 at VDOT 60) and a constant misses the table at both ends.

// ── Distance catalog ─────────────────────────────────────────────────────────

export interface PrDistance {
  /** Stable identifier persisted on the User row. */
  id: string;
  label: string;
  meters: number;
  /** How a time for this distance should be entered and displayed. */
  format: "mmss" | "mmssTenths";
}

export const PR_DISTANCES: PrDistance[] = [
  { id: "800m",     label: "800m",          meters: 800,   format: "mmssTenths" },
  { id: "1500m",    label: "1500m",         meters: 1500,  format: "mmssTenths" },
  { id: "mile",     label: "Mile",          meters: 1609.34, format: "mmssTenths" },
  { id: "3k",       label: "3K",            meters: 3000,  format: "mmss" },
  { id: "5k",       label: "5K",            meters: 5000,  format: "mmss" },
  { id: "8k",       label: "8K",            meters: 8000,  format: "mmss" },
  { id: "10k",      label: "10K",           meters: 10000, format: "mmss" },
  { id: "half",     label: "Half Marathon", meters: 21097.5, format: "mmss" },
  { id: "marathon", label: "Marathon",      meters: 42195, format: "mmss" },
];

export function prDistanceById(id: string): PrDistance | null {
  return PR_DISTANCES.find((d) => d.id === id) ?? null;
}

/**
 * The `Meet.primaryEvent` value matching a PR distance, where the meets form
 * offers one. Lets a declared PR populate the athlete's race PR instead of
 * asking for the same time twice. Road distances (8K, half, marathon) have no
 * track-event equivalent and return null.
 */
const MEET_EVENT_BY_PR_DISTANCE: Record<string, string> = {
  "800m": "800m",
  "1500m": "1500m",
  mile: "Mile",
  "3k": "3000m",
  "5k": "5000m",
  "10k": "10000m",
};

export function meetEventForPrDistance(distanceId: string): string | null {
  return MEET_EVENT_BY_PR_DISTANCE[distanceId] ?? null;
}

export function prDistanceForMeetEvent(event: string): PrDistance | null {
  const entry = Object.entries(MEET_EVENT_BY_PR_DISTANCE).find(([, e]) => e === event);
  return entry ? prDistanceById(entry[0]) : null;
}

/** Example time in the expected format, shown as the input placeholder. */
export function prTimePlaceholder(distanceId: string): string {
  const examples: Record<string, string> = {
    "800m": "2:05.4",
    "1500m": "4:20.5",
    mile: "4:45.0",
    "3k": "9:45",
    "5k": "17:30",
    "8k": "28:40",
    "10k": "36:20",
    half: "1:22:30",
    marathon: "2:55:00",
  };
  return examples[distanceId] ?? "MM:SS";
}

// ── Core regressions ─────────────────────────────────────────────────────────

const VO2_A = 0.000104;
const VO2_B = 0.182258;
const VO2_C = -4.60;

/** Oxygen cost (ml/kg/min) of running at `velocityMPerMin`. */
export function oxygenCost(velocityMPerMin: number): number {
  return VO2_C + VO2_B * velocityMPerMin + VO2_A * velocityMPerMin * velocityMPerMin;
}

/** Fraction of VO2max sustainable for a race of `minutes`. */
export function sustainableFraction(minutes: number): number {
  return (
    0.8 +
    0.1894393 * Math.exp(-0.012778 * minutes) +
    0.2989558 * Math.exp(-0.1932605 * minutes)
  );
}

/** Inverse of `oxygenCost`: velocity (m/min) that costs `vo2` ml/kg/min. */
export function velocityForOxygenCost(vo2: number): number {
  const c = VO2_C - vo2;
  return (-VO2_B + Math.sqrt(VO2_B * VO2_B - 4 * VO2_A * c)) / (2 * VO2_A);
}

/**
 * VDOT implied by racing `distanceMeters` in `timeSeconds`.
 * Reproduces Daniels' published tables to within ~0.05 VDOT for 1500m–marathon.
 */
export function vdotFromPerformance(distanceMeters: number, timeSeconds: number): number {
  if (distanceMeters <= 0 || timeSeconds <= 0) {
    throw new Error("vdotFromPerformance requires positive distance and time");
  }
  const velocity = (distanceMeters / timeSeconds) * 60;
  return oxygenCost(velocity) / sustainableFraction(timeSeconds / 60);
}

/**
 * Time (seconds) in which an athlete of `vdot` would race `distanceMeters`.
 * Inverts `vdotFromPerformance` by bisection — VDOT is strictly decreasing in
 * time for a fixed distance, so the bracket is safe.
 */
export function raceTimeForVdot(vdot: number, distanceMeters: number): number {
  let lo = 1;
  let hi = 60_000; // ~16.7h, well past any plausible marathon
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (vdotFromPerformance(distanceMeters, mid) > vdot) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// ── Training pace table ──────────────────────────────────────────────────────

/**
 * Daniels' training intensities as a fraction of VO2max. Easy is a range;
 * threshold/interval/rep are points. Calibrated against the published table at
 * VDOT 50 (E 8:14–9:04, T 6:51, I 6:19, R 5:50 per mile).
 */
const ZONE_FRACTIONS = {
  easyFast: 0.70,
  easySlow: 0.62,
  threshold: 0.88,
  interval: 0.975,
  rep: 1.08,
} as const;

export interface PaceTable {
  /** Metres per second for each zone. Format for display with `formatPace`. */
  easyPaceMs: number;
  easyFastPaceMs: number;
  easySlowPaceMs: number;
  marathonPaceMs: number;
  thresholdPaceMs: number;
  intervalPaceMs: number;
  repPaceMs: number;
}

function velocityAtFraction(vdot: number, fraction: number): number {
  return velocityForOxygenCost(fraction * vdot) / 60; // m/min → m/s
}

/** Full training pace table for a given VDOT. */
export function pacesFromVdot(vdot: number): PaceTable {
  const easyFastPaceMs = velocityAtFraction(vdot, ZONE_FRACTIONS.easyFast);
  const easySlowPaceMs = velocityAtFraction(vdot, ZONE_FRACTIONS.easySlow);
  const marathonPaceMs = 42195 / raceTimeForVdot(vdot, 42195);

  return {
    easyPaceMs: (easyFastPaceMs + easySlowPaceMs) / 2,
    easyFastPaceMs,
    easySlowPaceMs,
    marathonPaceMs,
    thresholdPaceMs: velocityAtFraction(vdot, ZONE_FRACTIONS.threshold),
    intervalPaceMs: velocityAtFraction(vdot, ZONE_FRACTIONS.interval),
    repPaceMs: velocityAtFraction(vdot, ZONE_FRACTIONS.rep),
  };
}

// ── PR plausibility validation ───────────────────────────────────────────────

/**
 * Per-distance bounds. Floors sit just under the world record so a mistyped
 * time is rejected but a genuinely elite one is not; ceilings catch unit
 * confusion (e.g. entering a marathon time in minutes).
 */
const TIME_BOUNDS: Record<string, { min: number; max: number }> = {
  "800m":     { min: 95,   max: 600 },
  "1500m":    { min: 195,  max: 1200 },
  "mile":     { min: 210,  max: 1320 },
  "3k":       { min: 420,  max: 2400 },
  "5k":       { min: 720,  max: 4200 },
  "8k":       { min: 1200, max: 6000 },
  "10k":      { min: 1500, max: 7800 },
  "half":     { min: 3300, max: 16200 },
  "marathon": { min: 7000, max: 36000 },
};

/** VDOT outside this range indicates a data-entry error rather than an athlete. */
const VDOT_MIN = 20;
const VDOT_MAX = 90;

export interface PrValidation {
  ok: boolean;
  error?: string;
}

/** Rejects implausible PR times before they reach the model. */
export function validatePrTime(distanceId: string, timeSeconds: number): PrValidation {
  const distance = prDistanceById(distanceId);
  if (!distance) return { ok: false, error: "Unknown distance." };
  if (!Number.isFinite(timeSeconds) || timeSeconds <= 0) {
    return { ok: false, error: "Enter a time." };
  }

  const bounds = TIME_BOUNDS[distanceId];
  if (bounds && timeSeconds < bounds.min) {
    return {
      ok: false,
      error: `That's faster than the ${distance.label} world record. Check the format. ${formatBound(bounds.min)} or slower.`,
    };
  }
  if (bounds && timeSeconds > bounds.max) {
    return {
      ok: false,
      error: `That's slower than we can build paces from. Expected under ${formatBound(bounds.max)} for ${distance.label}.`,
    };
  }

  const vdot = vdotFromPerformance(distance.meters, timeSeconds);
  if (vdot < VDOT_MIN || vdot > VDOT_MAX) {
    return { ok: false, error: "That time doesn't look right for this distance. Double-check it." };
  }

  return { ok: true };
}

function formatBound(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m >= 60) {
    return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ── Short-distance reliability ───────────────────────────────────────────────

/**
 * The %VO2max curve assumes an aerobically-limited effort. At 800m the
 * anaerobic contribution is large enough that VDOT overstates aerobic fitness,
 * yielding training paces that are too fast. Daniels' own tables are dependable
 * from 1500m up.
 */
export const SHORT_DISTANCE_IDS = new Set(["800m"]);

export interface DistanceGuidance {
  reliable: boolean;
  warning?: string;
  /** Distances we'd rather derive paces from, nearest first. */
  preferredAlternatives: PrDistance[];
}

export function prDistanceGuidance(distanceId: string): DistanceGuidance {
  if (!SHORT_DISTANCE_IDS.has(distanceId)) {
    return { reliable: true, preferredAlternatives: [] };
  }
  const distance = prDistanceById(distanceId);
  const meters = distance?.meters ?? 0;
  return {
    reliable: false,
    warning:
      "800m is largely anaerobic, so it overstates aerobic fitness, and your training paces will come out faster than they should. A PR from 1500m or longer gives a more accurate table.",
    preferredAlternatives: PR_DISTANCES.filter((d) => d.meters > meters).slice(0, 4),
  };
}

// ── Staleness ────────────────────────────────────────────────────────────────

/** A PR this recent is taken at face value. */
const FRESH_MONTHS = 3;
/** By this age its weight has decayed to `STALE_FLOOR`. */
const STALE_MONTHS = 24;
/** A PR never stops counting entirely — it is still the only hard data point. */
export const STALE_FLOOR = 0.2;

const MS_PER_MONTH = 30.44 * 24 * 60 * 60 * 1000;

export function monthsBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / MS_PER_MONTH;
}

/**
 * Confidence in a declared PR, decaying linearly from 1.0 at `FRESH_MONTHS` to
 * `STALE_FLOOR` at `STALE_MONTHS`. A decay rather than an expiry: a hard cutoff
 * makes paces jump on an arbitrary date with no visible cause.
 */
export function declaredConfidence(prSetOn: Date | null, now: Date = new Date()): number {
  if (!prSetOn) return 0;
  const ageMonths = monthsBetween(prSetOn, now);
  if (ageMonths <= FRESH_MONTHS) return 1;
  if (ageMonths >= STALE_MONTHS) return STALE_FLOOR;
  const t = (ageMonths - FRESH_MONTHS) / (STALE_MONTHS - FRESH_MONTHS);
  return 1 - t * (1 - STALE_FLOOR);
}

/**
 * Athletes rarely recall an exact race date, so recency is collected as a
 * bucket. The bucket is stored for honest display ("about 6 months ago") and a
 * representative date is derived from it for the confidence maths.
 */
export interface PrRecencyOption {
  id: string;
  label: string;
  /** Representative age in months, used to derive a date. */
  monthsAgo: number;
}

export const PR_RECENCY_OPTIONS: PrRecencyOption[] = [
  { id: "under_1m", label: "Within the last month", monthsAgo: 0.5 },
  { id: "1_3m",     label: "1–3 months ago",        monthsAgo: 2 },
  { id: "3_6m",     label: "3–6 months ago",        monthsAgo: 4.5 },
  { id: "6_12m",    label: "6–12 months ago",       monthsAgo: 9 },
  { id: "1_2y",     label: "1–2 years ago",         monthsAgo: 18 },
  { id: "over_2y",  label: "More than 2 years ago", monthsAgo: 30 },
];

export function prRecencyById(id: string): PrRecencyOption | null {
  return PR_RECENCY_OPTIONS.find((o) => o.id === id) ?? null;
}

/** Representative date for a recency bucket, for `declaredConfidence`. */
export function recencyToDate(recencyId: string, now: Date = new Date()): Date | null {
  const option = prRecencyById(recencyId);
  if (!option) return null;
  return new Date(now.getTime() - option.monthsAgo * MS_PER_MONTH);
}

// ── Blending declared PR with observed fitness ───────────────────────────────

/** Qualifying efforts at which observed data fully replaces the declared PR. */
export const OBSERVED_FULL_WEIGHT_EFFORTS = 8;

export type PaceSourceKind = "pr" | "observed" | "blended" | "none";

export interface PaceSource {
  kind: PaceSourceKind;
  vdot: number | null;
  /** Weight given to observed data, 0–1. */
  observedWeight: number;
  declaredConfidence: number;
  qualifyingEfforts: number;
  /** User-facing provenance, e.g. "Based on your 5K PR". */
  label: string;
  /** Longer explanation for tooltips and the transparency panel. */
  detail: string;
}

export interface BlendInput {
  declaredVdot: number | null;
  declaredDistanceLabel?: string | null;
  prSetOn?: Date | null;
  observedVdot: number | null;
  qualifyingEfforts: number;
  now?: Date;
}

/**
 * Blends in VDOT space, not pace space. VDOT is the single scalar the whole
 * table derives from, so blending here keeps the table internally consistent —
 * blending five paces independently can invert their ordering.
 *
 * The observed ramp `w = n / OBSERVED_FULL_WEIGHT_EFFORTS` is reweighted by the
 * declared PR's confidence:
 *
 *     w' = w / (w + (1 - w)·confidence)
 *
 * At confidence 1 this is the plain ramp. As the PR goes stale, confidence
 * falls and observed data displaces it sooner. Either way w'=0 on day one
 * (pure PR) and w'=1 once enough real efforts exist, so paces drift gradually
 * instead of jumping at a cutover.
 */
export function blendVdot(input: BlendInput): PaceSource {
  const now = input.now ?? new Date();
  // A PR whose date we don't know is treated as maximally stale rather than
  // discarded — dropping an athlete's declared PR over a missing timestamp is
  // exactly the silent, unexplained change this model exists to avoid.
  const confidence =
    input.declaredVdot == null
      ? 0
      : input.prSetOn
        ? declaredConfidence(input.prSetOn, now)
        : STALE_FLOOR;
  const efforts = Math.max(0, input.qualifyingEfforts);
  const rawWeight = Math.min(1, efforts / OBSERVED_FULL_WEIGHT_EFFORTS);

  const hasDeclared = input.declaredVdot != null && confidence > 0;
  const hasObserved = input.observedVdot != null;

  if (!hasDeclared && !hasObserved) {
    return {
      kind: "none",
      vdot: null,
      observedWeight: 0,
      declaredConfidence: 0,
      qualifyingEfforts: efforts,
      label: "No fitness data yet",
      detail:
        "Add a recent race result or sync a hard effort and PRform will build your training paces.",
    };
  }

  if (!hasDeclared) {
    return {
      kind: "observed",
      vdot: input.observedVdot,
      observedWeight: 1,
      declaredConfidence: 0,
      qualifyingEfforts: efforts,
      label: "Based on your last 6 weeks",
      detail: `Derived from ${efforts} hard effort${efforts === 1 ? "" : "s"} in your recent training. Add a race PR for a sharper estimate.`,
    };
  }

  const prLabel = input.declaredDistanceLabel
    ? `Based on your ${input.declaredDistanceLabel} PR`
    : "Based on your declared PR";

  if (!hasObserved || rawWeight === 0) {
    return {
      kind: "pr",
      vdot: input.declaredVdot,
      observedWeight: 0,
      declaredConfidence: confidence,
      qualifyingEfforts: efforts,
      label: prLabel,
      detail:
        confidence < 1
          ? "Your PR is the only fitness data we have. It's old enough that we'll lean on your logged training as soon as there's enough of it."
          : "Your PR is the only fitness data we have so far. These paces will adjust as you log training.",
    };
  }

  const w = rawWeight / (rawWeight + (1 - rawWeight) * confidence);
  const vdot = w * (input.observedVdot as number) + (1 - w) * (input.declaredVdot as number);

  if (w >= 0.995) {
    return {
      kind: "observed",
      vdot,
      observedWeight: 1,
      declaredConfidence: confidence,
      qualifyingEfforts: efforts,
      label: "Based on your last 6 weeks",
      detail: `Your logged training has fully replaced the PR you entered. ${efforts} qualifying efforts.`,
    };
  }

  return {
    kind: "blended",
    vdot,
    observedWeight: w,
    declaredConfidence: confidence,
    qualifyingEfforts: efforts,
    label: `${prLabel}, adjusted for recent training`,
    detail: `${Math.round(w * 100)}% from your ${efforts} recent hard effort${efforts === 1 ? "" : "s"}, ${Math.round((1 - w) * 100)}% from your PR. As you log more training this shifts toward observed fitness.`,
  };
}

// ── Convenience ──────────────────────────────────────────────────────────────

/** VDOT implied by a declared PR, or null if the input is not usable. */
export function vdotFromPr(distanceId: string, timeSeconds: number): number | null {
  const distance = prDistanceById(distanceId);
  if (!distance) return null;
  if (!validatePrTime(distanceId, timeSeconds).ok) return null;
  return round1(vdotFromPerformance(distance.meters, timeSeconds));
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Equivalent race times at every catalogued distance for a given VDOT. */
export function equivalentRaceTimes(vdot: number): { distance: PrDistance; seconds: number }[] {
  return PR_DISTANCES.map((distance) => ({
    distance,
    seconds: raceTimeForVdot(vdot, distance.meters),
  }));
}
