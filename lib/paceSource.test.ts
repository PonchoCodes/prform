import { describe, it, expect } from "vitest";
import { resolvePaces, declaredVdotFor, prDateFor, shouldPromptForPr } from "@/lib/paceSource";

const NOW = new Date("2026-08-05T00:00:00Z");
const monthsAgo = (m: number) => new Date(NOW.getTime() - m * 30.44 * 24 * 3600 * 1000);

const PR_5K_1957 = { prDistanceId: "5k", prTimeSeconds: 19 * 60 + 57 };

describe("declaredVdotFor", () => {
  it("derives VDOT from stored PR fields", () => {
    expect(declaredVdotFor(PR_5K_1957)).toBeCloseTo(50, 0);
  });

  it("is null when no PR is stored", () => {
    expect(declaredVdotFor({})).toBeNull();
    expect(declaredVdotFor({ prDistanceId: "5k" })).toBeNull();
    expect(declaredVdotFor({ prTimeSeconds: 1200 })).toBeNull();
  });

  it("is null when a stored PR no longer validates", () => {
    expect(declaredVdotFor({ prDistanceId: "5k", prTimeSeconds: 30 })).toBeNull();
  });
});

describe("prDateFor", () => {
  it("prefers the stored date", () => {
    const d = monthsAgo(4);
    expect(prDateFor({ prSetOn: d }, NOW)!.getTime()).toBe(d.getTime());
  });

  it("accepts a serialized date string, as returned over JSON", () => {
    const d = monthsAgo(4);
    expect(prDateFor({ prSetOn: d.toISOString() }, NOW)!.getTime()).toBe(d.getTime());
  });

  it("falls back to the recency bucket when no date is stored", () => {
    expect(prDateFor({ prRecency: "6_12m" }, NOW)).not.toBeNull();
  });

  it("is null with neither", () => {
    expect(prDateFor({}, NOW)).toBeNull();
  });

  it("ignores an unparseable stored date", () => {
    expect(prDateFor({ prSetOn: "not-a-date" }, NOW)).toBeNull();
  });
});

describe("resolvePaces", () => {
  const noHistory = { vdot: null, qualifyingEfforts: 0 };

  it("gives a full pace table on day one from a PR alone", () => {
    const r = resolvePaces(
      { ...PR_5K_1957, prSetOn: monthsAgo(1) },
      noHistory,
      NOW,
    );
    expect(r.source.kind).toBe("pr");
    expect(r.vdot).toBeCloseTo(50, 0);
    expect(r.paces).not.toBeNull();
    expect(r.paces!.thresholdPaceMs).toBeGreaterThan(0);
    expect(r.source.label).toBe("Based on your 5K PR");
  });

  it("returns nothing — not a guess — with no PR and no hard efforts", () => {
    const r = resolvePaces({}, noHistory, NOW);
    expect(r.source.kind).toBe("none");
    expect(r.vdot).toBeNull();
    expect(r.paces).toBeNull();
  });

  it("uses observed fitness when there is no PR", () => {
    const r = resolvePaces({}, { vdot: 46, qualifyingEfforts: 4 }, NOW);
    expect(r.source.kind).toBe("observed");
    expect(r.vdot).toBeCloseTo(46, 1);
    expect(r.source.label).toBe("Based on your last 6 weeks");
  });

  it("blends once history accumulates, landing between the two", () => {
    const r = resolvePaces(
      { ...PR_5K_1957, prSetOn: monthsAgo(1) },
      { vdot: 44, qualifyingEfforts: 4 },
      NOW,
    );
    expect(r.source.kind).toBe("blended");
    expect(r.vdot!).toBeGreaterThan(44);
    expect(r.vdot!).toBeLessThan(50);
  });

  it("keeps the pace table internally ordered while blending", () => {
    for (const efforts of [0, 1, 3, 5, 8]) {
      const r = resolvePaces(
        { ...PR_5K_1957, prSetOn: monthsAgo(1) },
        { vdot: 41, qualifyingEfforts: efforts },
        NOW,
      );
      const p = r.paces!;
      expect(p.easyPaceMs).toBeLessThan(p.marathonPaceMs);
      expect(p.marathonPaceMs).toBeLessThan(p.thresholdPaceMs);
      expect(p.thresholdPaceMs).toBeLessThan(p.intervalPaceMs);
      expect(p.intervalPaceMs).toBeLessThan(p.repPaceMs);
    }
  });

  it("moves paces gradually, never in a jump, as efforts accrue", () => {
    let prev: number | null = null;
    for (let n = 0; n <= 8; n++) {
      const r = resolvePaces(
        { ...PR_5K_1957, prSetOn: monthsAgo(1) },
        { vdot: 42, qualifyingEfforts: n },
        NOW,
      );
      const t = r.paces!.thresholdPaceMs;
      if (prev !== null) {
        // No single sync may shift threshold pace by more than ~4%.
        expect(Math.abs(t - prev) / prev).toBeLessThan(0.04);
      }
      prev = t;
    }
  });

  it("leans on observed data sooner when the PR is stale", () => {
    const observed = { vdot: 44, qualifyingEfforts: 3 };
    const fresh = resolvePaces({ ...PR_5K_1957, prSetOn: monthsAgo(1) }, observed, NOW);
    const stale = resolvePaces({ ...PR_5K_1957, prSetOn: monthsAgo(30) }, observed, NOW);
    expect(stale.vdot!).toBeLessThan(fresh.vdot!);
    expect(stale.source.observedWeight).toBeGreaterThan(fresh.source.observedWeight);
  });

  it("still uses a very old PR when it is the only data", () => {
    const r = resolvePaces({ ...PR_5K_1957, prSetOn: monthsAgo(36) }, noHistory, NOW);
    expect(r.source.kind).toBe("pr");
    expect(r.vdot).toBeCloseTo(50, 0);
  });

  it("always reports a provenance label and detail for the UI", () => {
    const cases = [
      resolvePaces({ ...PR_5K_1957, prSetOn: monthsAgo(1) }, noHistory, NOW),
      resolvePaces({}, { vdot: 45, qualifyingEfforts: 3 }, NOW),
      resolvePaces({ ...PR_5K_1957, prSetOn: monthsAgo(1) }, { vdot: 44, qualifyingEfforts: 4 }, NOW),
      resolvePaces({}, noHistory, NOW),
    ];
    for (const c of cases) {
      expect(c.source.label.length).toBeGreaterThan(0);
      expect(c.source.detail.length).toBeGreaterThan(0);
    }
  });
});

describe("shouldPromptForPr", () => {
  it("prompts an existing user with no PR", () => {
    expect(shouldPromptForPr({})).toBe(true);
  });

  it("does not prompt once a PR exists", () => {
    expect(shouldPromptForPr(PR_5K_1957)).toBe(false);
  });

  it("does not prompt again after dismissal", () => {
    expect(shouldPromptForPr({ prPromptDismissedAt: monthsAgo(2) })).toBe(false);
  });

  it("prompts a user who dismissed nothing and has only a partial PR", () => {
    expect(shouldPromptForPr({ prDistanceId: "5k" })).toBe(true);
  });
});
