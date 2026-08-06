// The product's own thesis, made checkable: does sleeping more actually predict
// hitting prescribed paces?
//
// Both series are rolling 7-day means rather than raw days. A single day's
// compliance is 0%, 50% or 100% — one run either hit its pace or didn't — and a
// chart of that is noise the athlete cannot act on. Seven days is the shortest
// window that turns it into a trend, and it matches the window the recovery
// score and the intervention card already reason over.
//
// No server imports, so this is safe in client components.

export interface TrendNight {
  /** YYYY-MM-DD */
  date: string;
  actualSleepHours?: number | null;
  /** The plan's target for that night, frozen at log time. Null on older rows. */
  targetSleepHours?: number | null;
}

export interface TrendRun {
  /** YYYY-MM-DD */
  date: string;
  onTarget: boolean;
}

export interface TrendPoint {
  date: string;
  /** 7-day mean hours slept, or null when the window holds no logged nights. */
  sleepHours: number | null;
  /** 7-day mean of the plan's target, or null when no night carried one. */
  targetHours: number | null;
  /** 7-day share of runs that hit their prescribed pace, 0–100. */
  compliance: number | null;
  nightsInWindow: number;
  runsInWindow: number;
}

export interface TrendResult {
  points: TrendPoint[];
  /** Nights with a usable sleep duration across the whole window. */
  nightsLogged: number;
  /** Runs that could be scored against a pace across the whole window. */
  runsScored: number;
  /** True once there is enough of both to draw something meaningful. */
  ready: boolean;
  /** Nights still needed before the chart appears. 0 once ready. */
  nightsNeeded: number;
  /** Runs still needed before the chart appears. 0 once ready. */
  runsNeeded: number;
}

/** A full rolling window of nights before the first point means anything. */
export const MIN_NIGHTS = 7;
/** Fewer runs than this and compliance is one athlete's opinion of one run. */
export const MIN_RUNS = 3;

const WINDOW_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Every date key in this app is a UTC slice — SleepLog rows are written at UTC
 * midnight, activity dates come from `startDate.toISOString()`. So all day
 * arithmetic here is UTC too. Mixing local midnight with `toISOString()` shifts
 * the entire series by a day for anyone west of UTC, which is invisible in the
 * chart and silently misaligns sleep against the runs it should explain.
 * UTC also has no DST, so fixed-millisecond steps are safe.
 */
function toKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function utcMidnight(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Builds the daily series. Days without enough data in their trailing window
 * carry nulls rather than zeros — a night that was never logged is missing, not
 * a night of no sleep, and Recharts gaps the line instead of drawing it to the
 * floor.
 */
export function buildSleepPaceTrend(
  nights: TrendNight[],
  runs: TrendRun[],
  opts: { days?: number; today?: Date } = {},
): TrendResult {
  const days = opts.days ?? 60;
  const today = utcMidnight(opts.today ? new Date(opts.today) : new Date());

  const sleepByDate = new Map<string, TrendNight>();
  for (const n of nights) {
    if (n.actualSleepHours != null) sleepByDate.set(n.date, n);
  }

  const runsByDate = new Map<string, TrendRun[]>();
  for (const r of runs) {
    const list = runsByDate.get(r.date);
    if (list) list.push(r);
    else runsByDate.set(r.date, [r]);
  }

  const points: TrendPoint[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const day = today - i * DAY_MS;

    const sleepValues: number[] = [];
    const targetValues: number[] = [];
    let onTarget = 0;
    let runCount = 0;

    for (let back = 0; back < WINDOW_DAYS; back++) {
      const key = toKey(day - back * DAY_MS);

      const night = sleepByDate.get(key);
      if (night?.actualSleepHours != null) {
        sleepValues.push(night.actualSleepHours);
        if (night.targetSleepHours != null) targetValues.push(night.targetSleepHours);
      }

      for (const run of runsByDate.get(key) ?? []) {
        runCount++;
        if (run.onTarget) onTarget++;
      }
    }

    const sleepMean = mean(sleepValues);
    const targetMean = mean(targetValues);

    points.push({
      date: toKey(day),
      sleepHours: sleepMean == null ? null : round1(sleepMean),
      targetHours: targetMean == null ? null : round1(targetMean),
      compliance: runCount > 0 ? Math.round((onTarget / runCount) * 100) : null,
      nightsInWindow: sleepValues.length,
      runsInWindow: runCount,
    });
  }

  // Totals are counted over the window itself, not summed across the rolling
  // windows, which would count every night up to seven times.
  const firstKey = toKey(today - (days - 1) * DAY_MS);
  const lastKey = toKey(today);
  const inWindow = (key: string) => key >= firstKey && key <= lastKey;

  const nightsLogged = Array.from(sleepByDate.keys()).filter(inWindow).length;
  const runsScored = runs.filter((r) => inWindow(r.date)).length;

  const nightsNeeded = Math.max(0, MIN_NIGHTS - nightsLogged);
  const runsNeeded = Math.max(0, MIN_RUNS - runsScored);

  return {
    points,
    nightsLogged,
    runsScored,
    ready: nightsNeeded === 0 && runsNeeded === 0,
    nightsNeeded,
    runsNeeded,
  };
}

/**
 * What to tell an athlete who doesn't have a chart yet. Always forward-looking
 * and always a real count — "no data yet" tells them nothing they can act on.
 */
export function trendCountdownCopy(result: TrendResult): string {
  const { nightsNeeded, runsNeeded } = result;

  if (nightsNeeded > 0 && runsNeeded > 0) {
    return `${nightsNeeded} more logged night${nightsNeeded === 1 ? "" : "s"} and ${runsNeeded} more run${runsNeeded === 1 ? "" : "s"} until your first trend appears.`;
  }
  if (nightsNeeded > 0) {
    return `${nightsNeeded} more logged night${nightsNeeded === 1 ? "" : "s"} and your first trend appears.`;
  }
  if (runsNeeded > 0) {
    return `${runsNeeded} more run${runsNeeded === 1 ? "" : "s"} and your first trend appears.`;
  }
  return "Your trend is ready.";
}
