import { describe, it, expect } from "vitest";
import {
  isValidRpe,
  manualDailyTss,
  sessionRpeLoad,
  tssFromSessionRpe,
} from "@/lib/trainingLoad";

describe("sessionRpeLoad", () => {
  it("is minutes × RPE", () => {
    expect(sessionRpeLoad(60, 7)).toBe(420);
    expect(sessionRpeLoad(45, 3)).toBe(135);
    expect(sessionRpeLoad(90, 5)).toBe(450);
  });

  it("rejects a zero or negative duration", () => {
    expect(sessionRpeLoad(0, 5)).toBeNull();
    expect(sessionRpeLoad(-30, 5)).toBeNull();
  });

  it("rejects a duration longer than any training day", () => {
    // 480 "minutes" is usually 8 hours typed into a field meant for minutes —
    // fine. 721+ minutes is not a session.
    expect(sessionRpeLoad(720, 2)).toBe(1440);
    expect(sessionRpeLoad(721, 2)).toBeNull();
  });

  it("rejects RPE outside 1–10 and non-integers", () => {
    expect(sessionRpeLoad(60, 0)).toBeNull();
    expect(sessionRpeLoad(60, 11)).toBeNull();
    expect(sessionRpeLoad(60, 6.5)).toBeNull();
    expect(sessionRpeLoad(60, NaN)).toBeNull();
  });
});

describe("tssFromSessionRpe", () => {
  it("maps one hour at threshold RPE to exactly 100 TSS", () => {
    expect(tssFromSessionRpe(60, 7)).toBe(100);
  });

  it("scales linearly with duration and RPE", () => {
    expect(tssFromSessionRpe(30, 7)).toBe(50);
    expect(tssFromSessionRpe(60, 3)).toBeCloseTo(42.9, 1);
    expect(tssFromSessionRpe(120, 7)).toBe(200);
  });

  it("passes invalid input through as null", () => {
    expect(tssFromSessionRpe(0, 7)).toBeNull();
    expect(tssFromSessionRpe(60, 12)).toBeNull();
  });
});

describe("isValidRpe", () => {
  it("accepts exactly the integers 1 through 10", () => {
    for (let r = 1; r <= 10; r++) expect(isValidRpe(r)).toBe(true);
    expect(isValidRpe(0)).toBe(false);
    expect(isValidRpe(11)).toBe(false);
    expect(isValidRpe(5.5)).toBe(false);
  });
});

describe("manualDailyTss", () => {
  const day = (d: string) => new Date(`${d}T10:00:00.000Z`);

  it("keys by UTC date and sums same-day sessions", () => {
    const map = manualDailyTss(
      [
        { date: day("2026-08-01"), duration: 60, effort: 7, isTemplate: false },
        { date: day("2026-08-01"), duration: 30, effort: 7, isTemplate: false },
        { date: day("2026-08-02"), duration: 60, effort: 3, isTemplate: false },
      ],
      new Set(),
    );
    expect(map.get("2026-08-01")).toBe(150);
    expect(map.get("2026-08-02")).toBeCloseTo(42.9, 1);
  });

  it("skips days Strava already covers — the same run must not count twice", () => {
    const map = manualDailyTss(
      [
        { date: day("2026-08-01"), duration: 60, effort: 7, isTemplate: false },
        { date: day("2026-08-02"), duration: 60, effort: 7, isTemplate: false },
      ],
      new Set(["2026-08-01"]),
    );
    expect(map.has("2026-08-01")).toBe(false);
    expect(map.get("2026-08-02")).toBe(100);
  });

  it("ignores templates and rows missing duration or RPE", () => {
    const map = manualDailyTss(
      [
        { date: day("2026-08-01"), duration: 60, effort: 7, isTemplate: true },
        { date: day("2026-08-02"), duration: null, effort: 7, isTemplate: false },
        { date: day("2026-08-03"), duration: 60, effort: null, isTemplate: false },
      ],
      new Set(),
    );
    expect(map.size).toBe(0);
  });
});
