import { describe, it, expect } from "vitest";
import {
  buildSleepPaceTrend,
  trendCountdownCopy,
  MIN_NIGHTS,
  MIN_RUNS,
  type TrendNight,
  type TrendRun,
} from "@/lib/trend";

const TODAY = new Date("2026-08-05T00:00:00.000Z");

/** YYYY-MM-DD for `n` days before TODAY, in UTC to match the date keys. */
function dayBefore(n: number): string {
  return new Date(TODAY.getTime() - n * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function nights(count: number, hours: number, target?: number): TrendNight[] {
  return Array.from({ length: count }, (_, i) => ({
    date: dayBefore(i),
    actualSleepHours: hours,
    targetSleepHours: target ?? null,
  }));
}

function runs(count: number, onTarget: boolean): TrendRun[] {
  return Array.from({ length: count }, (_, i) => ({ date: dayBefore(i), onTarget }));
}

describe("buildSleepPaceTrend", () => {
  it("emits one point per day in the window, oldest first", () => {
    const r = buildSleepPaceTrend([], [], { days: 30, today: TODAY });
    expect(r.points).toHaveLength(30);
    expect(r.points[0].date).toBe(dayBefore(29));
    expect(r.points[29].date).toBe(dayBefore(0));
  });

  it("averages sleep across the trailing 7 days", () => {
    const r = buildSleepPaceTrend(nights(7, 8), [], { days: 10, today: TODAY });
    const last = r.points[r.points.length - 1];
    expect(last.sleepHours).toBe(8);
    expect(last.nightsInWindow).toBe(7);
  });

  it("averages only the nights that exist, not the days", () => {
    // Two nights in the window: 6h and 10h. Mean is 8, not 16/7.
    const r = buildSleepPaceTrend(
      [
        { date: dayBefore(0), actualSleepHours: 6 },
        { date: dayBefore(1), actualSleepHours: 10 },
      ],
      [],
      { days: 10, today: TODAY },
    );
    const last = r.points[r.points.length - 1];
    expect(last.sleepHours).toBe(8);
    expect(last.nightsInWindow).toBe(2);
  });

  it("leaves gaps rather than zeros where nothing was logged", () => {
    const r = buildSleepPaceTrend(
      [{ date: dayBefore(0), actualSleepHours: 8 }],
      [{ date: dayBefore(0), onTarget: true }],
      { days: 30, today: TODAY },
    );
    // An unlogged night is missing data, not a night of no sleep — plotting 0
    // would draw the line to the floor and read as a catastrophe.
    expect(r.points[0].sleepHours).toBeNull();
    expect(r.points[0].compliance).toBeNull();
    expect(r.points[29].sleepHours).toBe(8);
  });

  it("computes compliance as the share of runs on target", () => {
    const r = buildSleepPaceTrend(
      [],
      [
        { date: dayBefore(0), onTarget: true },
        { date: dayBefore(1), onTarget: true },
        { date: dayBefore(2), onTarget: false },
        { date: dayBefore(3), onTarget: false },
      ],
      { days: 10, today: TODAY },
    );
    const last = r.points[r.points.length - 1];
    expect(last.compliance).toBe(50);
    expect(last.runsInWindow).toBe(4);
  });

  it("carries the frozen target only for nights that stored one", () => {
    const withTarget = buildSleepPaceTrend(nights(7, 7, 8.5), [], { days: 10, today: TODAY });
    expect(withTarget.points[withTarget.points.length - 1].targetHours).toBe(8.5);

    // Nights backfilled before the target columns shipped are excluded rather
    // than guessed from the current wake time, which drifts during a meet ramp.
    const withoutTarget = buildSleepPaceTrend(nights(7, 7), [], { days: 10, today: TODAY });
    expect(withoutTarget.points[withoutTarget.points.length - 1].targetHours).toBeNull();
    expect(withoutTarget.points[withoutTarget.points.length - 1].sleepHours).toBe(7);
  });

  it("counts each night once, not once per rolling window it appears in", () => {
    const r = buildSleepPaceTrend(nights(10, 8), runs(4, true), { days: 30, today: TODAY });
    expect(r.nightsLogged).toBe(10);
    expect(r.runsScored).toBe(4);
  });

  it("ignores data older than the window", () => {
    const r = buildSleepPaceTrend(
      [...nights(3, 8), { date: dayBefore(45), actualSleepHours: 8 }],
      [{ date: dayBefore(45), onTarget: true }],
      { days: 30, today: TODAY },
    );
    expect(r.nightsLogged).toBe(3);
    expect(r.runsScored).toBe(0);
  });

  it("shows the thesis when it holds: more sleep, higher compliance", () => {
    // Two weeks: a short-sleep week that missed paces, then a full-sleep week
    // that hit them. The two series should move together.
    const sleepNights: TrendNight[] = [];
    const paceRuns: TrendRun[] = [];
    for (let i = 0; i < 7; i++) {
      sleepNights.push({ date: dayBefore(i), actualSleepHours: 8.5 });
      paceRuns.push({ date: dayBefore(i), onTarget: true });
    }
    for (let i = 7; i < 14; i++) {
      sleepNights.push({ date: dayBefore(i), actualSleepHours: 6 });
      paceRuns.push({ date: dayBefore(i), onTarget: false });
    }

    const r = buildSleepPaceTrend(sleepNights, paceRuns, { days: 14, today: TODAY });
    const earlier = r.points.find((p) => p.date === dayBefore(10))!;
    const latest = r.points[r.points.length - 1];

    expect(earlier.sleepHours).toBe(6);
    expect(earlier.compliance).toBe(0);
    expect(latest.sleepHours).toBe(8.5);
    expect(latest.compliance).toBe(100);
  });
});

describe("readiness threshold", () => {
  it("is not ready with no data, and says how much is missing", () => {
    const r = buildSleepPaceTrend([], [], { days: 60, today: TODAY });
    expect(r.ready).toBe(false);
    expect(r.nightsNeeded).toBe(MIN_NIGHTS);
    expect(r.runsNeeded).toBe(MIN_RUNS);
    expect(trendCountdownCopy(r)).toBe(
      "7 more logged nights and 3 more runs until your first trend appears.",
    );
  });

  it("counts down as nights arrive", () => {
    const r = buildSleepPaceTrend(nights(4, 8), runs(3, true), { days: 60, today: TODAY });
    expect(r.ready).toBe(false);
    expect(r.nightsNeeded).toBe(3);
    expect(r.runsNeeded).toBe(0);
    expect(trendCountdownCopy(r)).toBe("3 more logged nights and your first trend appears.");
  });

  it("asks for runs when sleep is logged but nothing has been run", () => {
    const r = buildSleepPaceTrend(nights(MIN_NIGHTS, 8), runs(2, true), { days: 60, today: TODAY });
    expect(r.ready).toBe(false);
    expect(trendCountdownCopy(r)).toBe("1 more run and your first trend appears.");
  });

  it("becomes ready at exactly the thresholds", () => {
    const r = buildSleepPaceTrend(nights(MIN_NIGHTS, 8), runs(MIN_RUNS, true), {
      days: 60,
      today: TODAY,
    });
    expect(r.ready).toBe(true);
    expect(r.nightsNeeded).toBe(0);
    expect(r.runsNeeded).toBe(0);
  });

  it("singularises the countdown copy", () => {
    const r = buildSleepPaceTrend(nights(MIN_NIGHTS - 1, 8), runs(MIN_RUNS - 1, true), {
      days: 60,
      today: TODAY,
    });
    expect(trendCountdownCopy(r)).toBe(
      "1 more logged night and 1 more run until your first trend appears.",
    );
  });
});
