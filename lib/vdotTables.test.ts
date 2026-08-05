import { describe, it, expect } from "vitest";
import {
  pacesFromVdot,
  raceTimeForVdot,
  vdotFromPerformance,
  velocityForOxygenCost,
} from "@/lib/vdot";

// ─────────────────────────────────────────────────────────────────────────────
// Verification of the pace model across the whole usable VDOT range.
//
// An inverted regression can be accurate mid-range and drift at the extremes,
// so every check below runs at VDOT 30 through 70, not just at the VDOT 50
// point the model was originally calibrated on.
//
// TOLERANCES
//   race times      ±2 s   — observed max deviation is 1.8s; Daniels' printed
//                            tables round to the second.
//   M / T / I / R   ±3 s/mi — ~0.7% at 7:00/mi, finer than anyone can execute
//                            on a track. A structural error (wrong %VO2max
//                            fraction) shows up as 20s+/mi and is caught easily.
//   E               ±5 s/mi — Easy is a soft range and editions differ on the
//                            printed endpoints.
// ─────────────────────────────────────────────────────────────────────────────

const RACE_TIME_TOLERANCE_S = 2;
const PACE_TOLERANCE_S_PER_MI = 3;
const EASY_PACE_TOLERANCE_S_PER_MI = 5;

const VDOT_RANGE = [30, 40, 45, 50, 55, 60, 65, 70] as const;

/** "6:51" | "3:10:49" → seconds */
function t(clock: string): number {
  const parts = clock.split(":").map(Number);
  return parts.length === 3
    ? parts[0] * 3600 + parts[1] * 60 + parts[2]
    : parts[0] * 60 + parts[1];
}

/** m/s → seconds per mile */
function secPerMile(ms: number): number {
  return 1609.34 / ms;
}

function fmt(secondsPerMile: number): string {
  const m = Math.floor(secondsPerMile / 60);
  const s = Math.round(secondsPerMile % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ─── Race equivalence — the actual definition of VDOT ────────────────────────

describe("race-time equivalence against Daniels' published times", () => {
  /** Daniels' published 5K time for each VDOT. */
  const PUBLISHED_5K: Record<number, string> = {
    30: "30:40",
    40: "24:08",
    45: "21:50",
    50: "19:57",
    55: "18:22",
    60: "17:03",
    65: "15:54",
    70: "14:55",
  };

  it.each(VDOT_RANGE)("VDOT %i reproduces the published 5K time", (vdot) => {
    const predicted = raceTimeForVdot(vdot, 5000);
    expect(Math.abs(predicted - t(PUBLISHED_5K[vdot]))).toBeLessThanOrEqual(
      RACE_TIME_TOLERANCE_S,
    );
  });

  it("shows no systematic drift at the extremes", () => {
    // If the inversion drifted, error would trend monotonically with VDOT.
    // It does not — signs alternate — so this asserts the ends are no worse
    // than the middle rather than merely that each point is in tolerance.
    const err = (v: number) => Math.abs(raceTimeForVdot(v, 5000) - t(PUBLISHED_5K[v]));
    const ends = Math.max(err(30), err(70));
    const middle = Math.max(err(45), err(50), err(55));
    expect(ends).toBeLessThanOrEqual(middle + 1);
  });

  it("gives one consistent VDOT across race distances", () => {
    // Daniels' published VDOT 50 equivalents. The whole point of VDOT is that
    // these three performances score the same.
    expect(vdotFromPerformance(5000, t("19:57"))).toBeCloseTo(50, 0);
    expect(vdotFromPerformance(10000, t("41:21"))).toBeCloseTo(50, 0);
    expect(vdotFromPerformance(42195, t("3:10:49"))).toBeCloseTo(50, 0);
  });

  it("inverts exactly — round trip is lossless at every distance and VDOT", () => {
    for (const vdot of VDOT_RANGE) {
      for (const d of [1500, 1609.34, 3000, 5000, 10000, 21097.5, 42195]) {
        expect(vdotFromPerformance(d, raceTimeForVdot(vdot, d))).toBeCloseTo(vdot, 9);
      }
    }
  });
});

// ─── Training pace table ─────────────────────────────────────────────────────

describe("training pace table across the VDOT range", () => {
  /**
   * Regression baseline, min/mile.
   *
   * NOT transcribed from Running Formula. These are this model's own outputs,
   * checked by the maintainer against their own race times and target training
   * paces and accepted as correct. Published pace tables available online
   * contradict each other (and in places themselves), so they were not usable
   * as a reference — race-time equivalence above is the authoritative check.
   *
   * Purpose here is to pin the model: any future change to the zone fractions
   * or the inversion shifts these and fails loudly.
   */
  const BASELINE: Record<number, { eFast: string; eSlow: string; m: string; t: string; i: string; r: string }> = {
    30: { eFast: "12:19", eSlow: "13:30", m: "11:03", t: "10:18", i: "9:30", r: "8:46" },
    40: { eFast: "9:50",  eSlow: "10:49", m: "8:45",  t: "8:12",  i: "7:33", r: "6:57" },
    45: { eFast: "8:57",  eSlow: "9:52",  m: "7:57",  t: "7:27",  i: "6:52", r: "6:19" },
    50: { eFast: "8:14",  eSlow: "9:04",  m: "7:16",  t: "6:51",  i: "6:18", r: "5:48" },
    55: { eFast: "7:38",  eSlow: "8:24",  m: "6:43",  t: "6:20",  i: "5:50", r: "5:22" },
    60: { eFast: "7:06",  eSlow: "7:50",  m: "6:14",  t: "5:54",  i: "5:26", r: "5:00" },
    65: { eFast: "6:40",  eSlow: "7:21",  m: "5:49",  t: "5:32",  i: "5:06", r: "4:41" },
    70: { eFast: "6:16",  eSlow: "6:55",  m: "5:28",  t: "5:13",  i: "4:48", r: "4:25" },
  };

  it.each(VDOT_RANGE)("VDOT %i matches the baseline for M, T, I and R", (vdot) => {
    const p = pacesFromVdot(vdot);
    const expected = BASELINE[vdot];
    const checks: [string, number, string][] = [
      ["marathon", p.marathonPaceMs, expected.m],
      ["threshold", p.thresholdPaceMs, expected.t],
      ["interval", p.intervalPaceMs, expected.i],
      ["repetition", p.repPaceMs, expected.r],
    ];
    for (const [zone, ms, want] of checks) {
      const actual = secPerMile(ms);
      const drift = actual - t(want);
      expect(
        Math.abs(drift),
        `${zone} at VDOT ${vdot}: expected ${want}/mi, got ${fmt(actual)}/mi (${drift > 0 ? "+" : ""}${drift.toFixed(1)}s)`,
      ).toBeLessThanOrEqual(PACE_TOLERANCE_S_PER_MI);
    }
  });

  it.each(VDOT_RANGE)("VDOT %i matches the baseline easy range", (vdot) => {
    const p = pacesFromVdot(vdot);
    const expected = BASELINE[vdot];
    expect(Math.abs(secPerMile(p.easyFastPaceMs) - t(expected.eFast))).toBeLessThanOrEqual(
      EASY_PACE_TOLERANCE_S_PER_MI,
    );
    expect(Math.abs(secPerMile(p.easySlowPaceMs) - t(expected.eSlow))).toBeLessThanOrEqual(
      EASY_PACE_TOLERANCE_S_PER_MI,
    );
  });

  it("keeps zones correctly ordered at every VDOT", () => {
    for (const vdot of VDOT_RANGE) {
      const p = pacesFromVdot(vdot);
      expect(p.easySlowPaceMs).toBeLessThan(p.easyFastPaceMs);
      expect(p.easyFastPaceMs).toBeLessThan(p.marathonPaceMs);
      expect(p.marathonPaceMs).toBeLessThan(p.thresholdPaceMs);
      expect(p.thresholdPaceMs).toBeLessThan(p.intervalPaceMs);
      expect(p.intervalPaceMs).toBeLessThan(p.repPaceMs);
    }
  });

  it("is strictly monotonic in VDOT for every zone", () => {
    for (let i = 1; i < VDOT_RANGE.length; i++) {
      const lo = pacesFromVdot(VDOT_RANGE[i - 1]);
      const hi = pacesFromVdot(VDOT_RANGE[i]);
      for (const key of [
        "easyFastPaceMs",
        "easySlowPaceMs",
        "marathonPaceMs",
        "thresholdPaceMs",
        "intervalPaceMs",
        "repPaceMs",
      ] as const) {
        expect(hi[key]).toBeGreaterThan(lo[key]);
      }
    }
  });

  it("keeps threshold slower than 5K race pace at every VDOT", () => {
    // Physiological sanity: T is roughly one-hour race pace, so it must sit
    // on the slow side of a 5K. A wrong zone fraction would break this.
    for (const vdot of VDOT_RANGE) {
      const fiveKPace = 5000 / raceTimeForVdot(vdot, 5000);
      expect(pacesFromVdot(vdot).thresholdPaceMs).toBeLessThan(fiveKPace);
    }
  });
});

// ─── Marathon pace — inverts at 42195m, new sustainable-fraction handling ────

describe("marathon pace", () => {
  it.each(VDOT_RANGE)("VDOT %i marathon pace equals its predicted marathon race pace", (vdot) => {
    // M pace is defined as marathon race pace, so these must agree exactly —
    // this is what inverting at 42195m buys over a fixed %VO2max.
    const raceTime = raceTimeForVdot(vdot, 42195);
    expect(pacesFromVdot(vdot).marathonPaceMs).toBeCloseTo(42195 / raceTime, 9);
  });

  it("reproduces Daniels' published VDOT 50 marathon of 3:10:49", () => {
    expect(Math.abs(raceTimeForVdot(50, 42195) - t("3:10:49"))).toBeLessThanOrEqual(15);
  });

  it("has a sustainable fraction that rises with fitness, as expected", () => {
    // 80.5% at VDOT 30 climbing to 83.0% at VDOT 70. This drift is exactly why
    // a fixed fraction was rejected.
    const fractionAt = (vdot: number) => {
      const mp = 42195 / raceTimeForVdot(vdot, 42195);
      let lo = 0.5;
      let hi = 1.2;
      for (let i = 0; i < 80; i++) {
        const f = (lo + hi) / 2;
        if (velocityForOxygenCost(f * vdot) / 60 < mp) lo = f;
        else hi = f;
      }
      return (lo + hi) / 2;
    };

    const fractions = VDOT_RANGE.map(fractionAt);
    for (let i = 1; i < fractions.length; i++) {
      expect(fractions[i]).toBeGreaterThan(fractions[i - 1]);
    }
    expect(fractions[0]).toBeCloseTo(0.805, 2);
    expect(fractions[fractions.length - 1]).toBeCloseTo(0.83, 2);
  });

  it("beats a fixed 0.835 fraction most at the low end, where drift would bite", () => {
    // A fixed fraction would be ~19s/mi too fast at VDOT 30 and ~1s/mi at 70.
    const errorAt = (vdot: number) => {
      const derived = 42195 / raceTimeForVdot(vdot, 42195);
      const fixed = velocityForOxygenCost(0.835 * vdot) / 60;
      return secPerMile(fixed) - secPerMile(derived);
    };
    expect(Math.abs(errorAt(30))).toBeGreaterThan(15);
    expect(Math.abs(errorAt(70))).toBeLessThan(3);
  });
});
