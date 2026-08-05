import { describe, it, expect } from "vitest";
import {
  vdotFromPerformance,
  raceTimeForVdot,
  pacesFromVdot,
  vdotFromPr,
  validatePrTime,
  prDistanceGuidance,
  declaredConfidence,
  blendVdot,
  equivalentRaceTimes,
  PR_DISTANCES,
  PR_RECENCY_OPTIONS,
  recencyToDate,
  OBSERVED_FULL_WEIGHT_EFFORTS,
} from "@/lib/vdot";

/** Seconds per mile at a given speed, for comparison against Daniels' tables. */
function secPerMile(ms: number): number {
  return 1609.34 / ms;
}

function mmss(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.round(totalSeconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

describe("vdotFromPerformance — against Daniels' published race times", () => {
  // Times Daniels lists for VDOT 50. All three distances must agree, which is
  // the whole point of VDOT: one number, consistent across race distances.
  it.each([
    ["5K", 5000, 19 * 60 + 57],
    ["10K", 10000, 41 * 60 + 21],
    ["marathon", 42195, 3 * 3600 + 10 * 60 + 49],
  ])("VDOT 50 %s time yields ~50", (_label, meters, seconds) => {
    expect(vdotFromPerformance(meters, seconds)).toBeCloseTo(50, 0);
  });

  it("is monotonic — a faster time over the same distance yields a higher VDOT", () => {
    const slower = vdotFromPerformance(5000, 20 * 60);
    const faster = vdotFromPerformance(5000, 18 * 60);
    expect(faster).toBeGreaterThan(slower);
  });

  it("rejects non-positive inputs", () => {
    expect(() => vdotFromPerformance(0, 600)).toThrow();
    expect(() => vdotFromPerformance(5000, 0)).toThrow();
  });
});

describe("raceTimeForVdot — inverse of vdotFromPerformance", () => {
  // Daniels' published 5K times by VDOT. Tolerance of 2s absorbs the rounding
  // in the printed tables.
  it.each([
    [30, 30 * 60 + 40],
    [40, 24 * 60 + 8],
    [45, 21 * 60 + 50],
    [50, 19 * 60 + 57],
    [55, 18 * 60 + 22],
    [60, 17 * 60 + 3],
    [65, 15 * 60 + 54],
    [70, 14 * 60 + 55],
  ])("VDOT %i predicts the published 5K time", (vdot, expected) => {
    expect(Math.abs(raceTimeForVdot(vdot, 5000) - expected)).toBeLessThanOrEqual(2);
  });

  it("round-trips with vdotFromPerformance", () => {
    for (const vdot of [35, 45, 55, 65]) {
      for (const { meters } of PR_DISTANCES) {
        const t = raceTimeForVdot(vdot, meters);
        expect(vdotFromPerformance(meters, t)).toBeCloseTo(vdot, 3);
      }
    }
  });
});

describe("pacesFromVdot — against Daniels' published pace table", () => {
  // Daniels' training paces for VDOT 50, in seconds per mile.
  // E 8:14–9:04, M 7:17, T 6:51, I 6:19, R 5:50.
  const p = pacesFromVdot(50);

  it("threshold pace matches 6:51/mi", () => {
    expect(Math.abs(secPerMile(p.thresholdPaceMs) - (6 * 60 + 51))).toBeLessThanOrEqual(3);
  });

  it("interval pace matches 6:19/mi", () => {
    expect(Math.abs(secPerMile(p.intervalPaceMs) - (6 * 60 + 19))).toBeLessThanOrEqual(3);
  });

  it("repetition pace matches 5:50/mi", () => {
    expect(Math.abs(secPerMile(p.repPaceMs) - (5 * 60 + 50))).toBeLessThanOrEqual(3);
  });

  it("marathon pace matches 7:17/mi", () => {
    expect(Math.abs(secPerMile(p.marathonPaceMs) - (7 * 60 + 17))).toBeLessThanOrEqual(3);
  });

  it("easy range brackets 8:14–9:04/mi", () => {
    expect(Math.abs(secPerMile(p.easyFastPaceMs) - (8 * 60 + 14))).toBeLessThanOrEqual(5);
    expect(Math.abs(secPerMile(p.easySlowPaceMs) - (9 * 60 + 4))).toBeLessThanOrEqual(5);
    expect(p.easySlowPaceMs).toBeLessThan(p.easyFastPaceMs);
  });

  it("checks a second anchor point — VDOT 60 threshold 5:54/mi, interval 5:26/mi", () => {
    const p60 = pacesFromVdot(60);
    expect(Math.abs(secPerMile(p60.thresholdPaceMs) - (5 * 60 + 54))).toBeLessThanOrEqual(3);
    expect(Math.abs(secPerMile(p60.intervalPaceMs) - (5 * 60 + 26))).toBeLessThanOrEqual(3);
  });

  it("orders zones correctly at every VDOT — this is what blending in VDOT space protects", () => {
    for (let vdot = 30; vdot <= 80; vdot += 5) {
      const t = pacesFromVdot(vdot);
      expect(t.easySlowPaceMs).toBeLessThan(t.easyFastPaceMs);
      expect(t.easyFastPaceMs).toBeLessThan(t.marathonPaceMs);
      expect(t.marathonPaceMs).toBeLessThan(t.thresholdPaceMs);
      expect(t.thresholdPaceMs).toBeLessThan(t.intervalPaceMs);
      expect(t.intervalPaceMs).toBeLessThan(t.repPaceMs);
    }
  });

  it("is faster at every zone for a higher VDOT", () => {
    const lo = pacesFromVdot(45);
    const hi = pacesFromVdot(55);
    expect(hi.easyPaceMs).toBeGreaterThan(lo.easyPaceMs);
    expect(hi.thresholdPaceMs).toBeGreaterThan(lo.thresholdPaceMs);
    expect(hi.repPaceMs).toBeGreaterThan(lo.repPaceMs);
  });

  it("does not reproduce the old linear approximation, which ran ~11% slow", () => {
    // Regression guard for the bug this module replaces: vVDOT ≈ 0.072·vdot + 0.27
    // put VDOT 50 threshold at 7:53/mi instead of 6:51/mi.
    const legacyThreshold = (0.072 * 50 + 0.27) * 0.88;
    expect(pacesFromVdot(50).thresholdPaceMs).toBeGreaterThan(legacyThreshold * 1.05);
  });
});

describe("vdotFromPr", () => {
  it("derives VDOT from a catalogued distance", () => {
    expect(vdotFromPr("5k", 19 * 60 + 57)).toBeCloseTo(50, 0);
  });

  it("returns null for an unknown distance or an implausible time", () => {
    expect(vdotFromPr("nonsense", 1200)).toBeNull();
    expect(vdotFromPr("5k", 60)).toBeNull();
  });

  it("gives a consistent VDOT across distances for equivalent performances", () => {
    const fromFive = vdotFromPr("5k", 19 * 60 + 57)!;
    const tenK = raceTimeForVdot(fromFive, 10000);
    expect(vdotFromPr("10k", tenK)!).toBeCloseTo(fromFive, 0);
  });
});

describe("validatePrTime — typo rejection", () => {
  it("accepts realistic times", () => {
    expect(validatePrTime("5k", 18 * 60).ok).toBe(true);
    expect(validatePrTime("marathon", 3 * 3600 + 30 * 60).ok).toBe(true);
    expect(validatePrTime("800m", 2 * 60 + 5).ok).toBe(true);
  });

  it("rejects times faster than the world record", () => {
    const r = validatePrTime("5k", 10 * 60);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/world record/i);
  });

  it("rejects a marathon time that was clearly entered in minutes", () => {
    // "3:30" parsed as 3m30s rather than 3h30m.
    expect(validatePrTime("marathon", 210).ok).toBe(false);
  });

  it("rejects absurdly slow times", () => {
    expect(validatePrTime("5k", 3 * 3600).ok).toBe(false);
  });

  it("rejects unknown distances and non-finite input", () => {
    expect(validatePrTime("2k", 400).ok).toBe(false);
    expect(validatePrTime("5k", NaN).ok).toBe(false);
    expect(validatePrTime("5k", -5).ok).toBe(false);
  });

  it("accepts a genuinely elite time", () => {
    expect(validatePrTime("5k", 12 * 60 + 40).ok).toBe(true);
  });
});

describe("prDistanceGuidance — 800m warning", () => {
  it("flags 800m as unreliable and suggests longer distances", () => {
    const g = prDistanceGuidance("800m");
    expect(g.reliable).toBe(false);
    expect(g.warning).toMatch(/anaerobic/i);
    expect(g.preferredAlternatives.length).toBeGreaterThan(0);
    expect(g.preferredAlternatives.every((d) => d.meters > 800)).toBe(true);
  });

  it("does not flag 1500m and longer", () => {
    for (const id of ["1500m", "mile", "5k", "marathon"]) {
      expect(prDistanceGuidance(id).reliable).toBe(true);
    }
  });

  it("still produces a VDOT for 800m — the warning is advisory, not a block", () => {
    expect(vdotFromPr("800m", 2 * 60 + 5)).toBeGreaterThan(0);
  });
});

describe("declaredConfidence — staleness decay", () => {
  const now = new Date("2026-08-05T00:00:00Z");
  const monthsAgo = (m: number) => new Date(now.getTime() - m * 30.44 * 24 * 3600 * 1000);

  it("trusts a PR from the last 3 months fully", () => {
    expect(declaredConfidence(monthsAgo(0), now)).toBe(1);
    expect(declaredConfidence(monthsAgo(3), now)).toBe(1);
  });

  it("decays between 3 and 24 months", () => {
    const six = declaredConfidence(monthsAgo(6), now);
    const twelve = declaredConfidence(monthsAgo(12), now);
    expect(six).toBeLessThan(1);
    expect(twelve).toBeLessThan(six);
    expect(twelve).toBeGreaterThan(0.2);
  });

  it("floors at 0.2 rather than expiring — no cliff", () => {
    expect(declaredConfidence(monthsAgo(24), now)).toBeCloseTo(0.2, 5);
    expect(declaredConfidence(monthsAgo(60), now)).toBeCloseTo(0.2, 5);
  });

  it("is 0 when no date is known", () => {
    expect(declaredConfidence(null, now)).toBe(0);
  });

  it("is continuous across the 3-month boundary", () => {
    const just = declaredConfidence(monthsAgo(3.01), now);
    expect(Math.abs(just - 1)).toBeLessThan(0.01);
  });
});

describe("recencyToDate", () => {
  const now = new Date("2026-08-05T00:00:00Z");

  it("maps every bucket to a date in the past", () => {
    for (const option of PR_RECENCY_OPTIONS) {
      const d = recencyToDate(option.id, now)!;
      expect(d.getTime()).toBeLessThan(now.getTime());
    }
  });

  it("orders buckets from most to least recent", () => {
    const times = PR_RECENCY_OPTIONS.map((o) => recencyToDate(o.id, now)!.getTime());
    for (let i = 1; i < times.length; i++) {
      expect(times[i]).toBeLessThan(times[i - 1]);
    }
  });

  it("feeds confidence — recent buckets are trusted, old ones are not", () => {
    expect(declaredConfidence(recencyToDate("under_1m", now), now)).toBe(1);
    expect(declaredConfidence(recencyToDate("1_3m", now), now)).toBe(1);
    expect(declaredConfidence(recencyToDate("over_2y", now), now)).toBeCloseTo(0.2, 5);
    expect(declaredConfidence(recencyToDate("6_12m", now), now)).toBeLessThan(1);
  });

  it("returns null for an unknown bucket", () => {
    expect(recencyToDate("someday", now)).toBeNull();
  });
});

describe("blendVdot", () => {
  const now = new Date("2026-08-05T00:00:00Z");
  const fresh = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
  const old = new Date(now.getTime() - 20 * 30.44 * 24 * 3600 * 1000);

  it("day one with a PR and no training is pure PR", () => {
    const s = blendVdot({
      declaredVdot: 50,
      declaredDistanceLabel: "5K",
      prSetOn: fresh,
      observedVdot: null,
      qualifyingEfforts: 0,
      now,
    });
    expect(s.kind).toBe("pr");
    expect(s.vdot).toBe(50);
    expect(s.observedWeight).toBe(0);
    expect(s.label).toBe("Based on your 5K PR");
  });

  it("no PR and no training reports no data rather than guessing", () => {
    const s = blendVdot({ declaredVdot: null, observedVdot: null, qualifyingEfforts: 0, now });
    expect(s.kind).toBe("none");
    expect(s.vdot).toBeNull();
  });

  it("no PR but real training uses observed fitness", () => {
    const s = blendVdot({ declaredVdot: null, observedVdot: 47, qualifyingEfforts: 5, now });
    expect(s.kind).toBe("observed");
    expect(s.vdot).toBe(47);
    expect(s.label).toBe("Based on your last 6 weeks");
  });

  it("moves gradually from PR toward observed as efforts accumulate", () => {
    const weights = [0, 1, 2, 4, 6, 8].map(
      (n) =>
        blendVdot({
          declaredVdot: 50,
          prSetOn: fresh,
          observedVdot: 44,
          qualifyingEfforts: n,
          now,
        }).observedWeight,
    );
    for (let i = 1; i < weights.length; i++) {
      expect(weights[i]).toBeGreaterThan(weights[i - 1]);
    }
    expect(weights[0]).toBe(0);
    expect(weights[weights.length - 1]).toBeCloseTo(1, 5);
  });

  it("never jumps — successive VDOTs move in small steps", () => {
    let prev = 50;
    for (let n = 0; n <= OBSERVED_FULL_WEIGHT_EFFORTS; n++) {
      const s = blendVdot({
        declaredVdot: 50,
        prSetOn: fresh,
        observedVdot: 40,
        qualifyingEfforts: n,
        now,
      });
      expect(Math.abs((s.vdot as number) - prev)).toBeLessThanOrEqual(2.5);
      prev = s.vdot as number;
    }
    expect(prev).toBeCloseTo(40, 5);
  });

  it("displaces a stale PR faster than a fresh one at equal effort counts", () => {
    const common = { declaredVdot: 50, observedVdot: 44, qualifyingEfforts: 3, now };
    const freshWeight = blendVdot({ ...common, prSetOn: fresh }).observedWeight;
    const staleWeight = blendVdot({ ...common, prSetOn: old }).observedWeight;
    expect(staleWeight).toBeGreaterThan(freshWeight);
  });

  it("still anchors day one on a stale PR", () => {
    const s = blendVdot({
      declaredVdot: 50,
      prSetOn: old,
      observedVdot: null,
      qualifyingEfforts: 0,
      now,
    });
    expect(s.kind).toBe("pr");
    expect(s.vdot).toBe(50);
  });

  it("reports blended provenance in between", () => {
    const s = blendVdot({
      declaredVdot: 50,
      declaredDistanceLabel: "5K",
      prSetOn: fresh,
      observedVdot: 44,
      qualifyingEfforts: 4,
      now,
    });
    expect(s.kind).toBe("blended");
    expect(s.vdot).toBeGreaterThan(44);
    expect(s.vdot).toBeLessThan(50);
    expect(s.label).toMatch(/5K PR/);
    expect(s.detail).toMatch(/%/);
  });

  it("hands over fully once enough efforts exist", () => {
    const s = blendVdot({
      declaredVdot: 50,
      prSetOn: fresh,
      observedVdot: 44,
      qualifyingEfforts: OBSERVED_FULL_WEIGHT_EFFORTS,
      now,
    });
    expect(s.kind).toBe("observed");
    expect(s.vdot).toBeCloseTo(44, 5);
  });

  it("keeps a dateless PR rather than discarding it", () => {
    const s = blendVdot({
      declaredVdot: 50,
      prSetOn: null,
      observedVdot: null,
      qualifyingEfforts: 0,
      now,
    });
    expect(s.kind).toBe("pr");
    expect(s.vdot).toBe(50);
    expect(s.declaredConfidence).toBeCloseTo(0.2, 5);
  });

  it("treats negative effort counts as zero", () => {
    const s = blendVdot({
      declaredVdot: 50,
      prSetOn: fresh,
      observedVdot: 44,
      qualifyingEfforts: -3,
      now,
    });
    expect(s.observedWeight).toBe(0);
  });
});

describe("equivalentRaceTimes", () => {
  it("returns a time for every catalogued distance, increasing with distance", () => {
    const rows = equivalentRaceTimes(50);
    expect(rows).toHaveLength(PR_DISTANCES.length);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].seconds).toBeGreaterThan(rows[i - 1].seconds);
    }
  });

  it("puts a VDOT 50 athlete near Daniels' 3:10:49 marathon", () => {
    const marathon = equivalentRaceTimes(50).find((r) => r.distance.id === "marathon")!;
    expect(Math.abs(marathon.seconds - (3 * 3600 + 10 * 60 + 49))).toBeLessThanOrEqual(15);
  });
});
