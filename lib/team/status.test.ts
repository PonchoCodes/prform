import { describe, it, expect } from "vitest";
import { deriveAthleteStatus, type NightForStatus } from "@/lib/team/status";

function night(date: string, actual: number | null, target = 8, needsReview = false): NightForStatus {
  return { date, actualSleepHours: actual, targetSleepHours: target, needsReview };
}

describe("deriveAthleteStatus", () => {
  it("flags an athlete with no logged nights as amber, not green", () => {
    const s = deriveAthleteStatus([]);
    expect(s.color).toBe("amber");
    expect(s.flagged).toBe(true);
    expect(s.trend).toMatch(/No sleep logged/);
  });

  it("is green and unflagged on a solid week", () => {
    const s = deriveAthleteStatus([
      night("2026-08-01", 8.2),
      night("2026-08-02", 7.9),
      night("2026-08-03", 8.4),
      night("2026-08-04", 8.0),
      night("2026-08-05", 7.8),
    ]);
    expect(s.color).toBe("green");
    expect(s.flagged).toBe(false);
    expect(s.trend).toMatch(/On target 5 of 5/);
  });

  it("misses under 45 minutes do not count as short", () => {
    const s = deriveAthleteStatus([
      night("2026-08-01", 7.6), // 24 min short — noise
      night("2026-08-02", 7.5), // 30 min short — noise
      night("2026-08-03", 8.0),
    ]);
    expect(s.color).toBe("green");
  });

  it("two short nights is amber and flagged", () => {
    const s = deriveAthleteStatus([
      night("2026-08-01", 6.5),
      night("2026-08-02", 8.1),
      night("2026-08-03", 7.0),
      night("2026-08-04", 8.0),
    ]);
    expect(s.color).toBe("amber");
    expect(s.flagged).toBe(true);
    expect(s.trend).toBe("Short on sleep 2 of 4 nights");
  });

  it("three short nights is red with a move-the-session recommendation", () => {
    const s = deriveAthleteStatus([
      night("2026-08-01", 6.5),
      night("2026-08-02", 6.0),
      night("2026-08-03", 8.2),
      night("2026-08-04", 7.0),
      night("2026-08-05", 8.0),
    ]);
    expect(s.color).toBe("red");
    expect(s.flagged).toBe(true);
    expect(s.trend).toBe("Short on sleep 3 of 5 nights");
    expect(s.recommendation).toMatch(/hard session|Aerobic/);
  });

  it("excludes flagged (needsReview) nights from scoring", () => {
    const s = deriveAthleteStatus([
      night("2026-08-01", 27, 8, true), // the 27-hour night must not help or hurt
      night("2026-08-02", 8.0),
      night("2026-08-03", 8.1),
      night("2026-08-04", 8.0),
    ]);
    expect(s.color).toBe("green");
    expect(s.trend).toMatch(/3 of 3/);
  });

  it("assumes an 8h target for legacy rows without one", () => {
    const s = deriveAthleteStatus([
      { date: "2026-08-01", actualSleepHours: 6.5, targetSleepHours: null },
      { date: "2026-08-02", actualSleepHours: 6.5, targetSleepHours: null },
      { date: "2026-08-03", actualSleepHours: 6.5, targetSleepHours: null },
    ]);
    expect(s.color).toBe("red");
  });

  it("only scores the trailing window", () => {
    const nights = [
      night("2026-07-01", 5), // ancient short nights…
      night("2026-07-02", 5),
      night("2026-07-03", 5),
      // …followed by a clean recent week
      night("2026-08-01", 8),
      night("2026-08-02", 8),
      night("2026-08-03", 8),
      night("2026-08-04", 8),
      night("2026-08-05", 8),
      night("2026-08-06", 8),
      night("2026-08-07", 8),
    ];
    expect(deriveAthleteStatus(nights, 7).color).toBe("green");
  });

  it("never leaks a clock time or an hours value into any string", () => {
    const statuses = [
      deriveAthleteStatus([]),
      deriveAthleteStatus([night("2026-08-01", 6.5), night("2026-08-02", 6.4), night("2026-08-03", 6.6)]),
      deriveAthleteStatus([night("2026-08-01", 8), night("2026-08-02", 8), night("2026-08-03", 8)]),
    ];
    for (const s of statuses) {
      const text = `${s.trend} ${s.recommendation}`;
      // No "6.5", no "22:30", no "8h". Counts like "3 of 5" are the only numbers.
      expect(text).not.toMatch(/\d+[.:]\d+/);
      expect(text).not.toMatch(/\d+\s*h\b/i);
      expect(text).not.toMatch(/\d+\s*hours/i);
    }
  });
});
