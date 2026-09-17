import { describe, it, expect } from "vitest";
import { findSleepValueLeaks, findSleepValueLeaksInPayload } from "@/lib/team/coachCopyGuard";

// The guard has to catch what the consent text promises away and let through
// what a coach is entitled to. Both directions are tested, because a guard
// that rejects "3 of 5 nights" would be routed around within a week.

describe("findSleepValueLeaks", () => {
  it("catches clock times, decimals and every spelling of hours and minutes", () => {
    const leaking = [
      "in bed by 22:30",
      "slept 6.5",
      "8h last night",
      "8 h last night",
      "8hrs",
      "about 8 hours",
      "1 hour short",
      "45 min short",
      "45 minutes short",
      "up at 6am",
      "up at 6 a.m.",
      "lights out 10 pm",
    ];
    for (const text of leaking) {
      expect(findSleepValueLeaks(text), text).not.toEqual([]);
    }
  });

  it("allows counts, percentages, day counts and weekday names", () => {
    const clean = [
      "Short on sleep 3 of 5 nights",
      "On target 7 of 7 nights",
      "62% logged",
      "4 days out",
      "1 day out",
      "Short Tuesday and Thursday",
      "Ramp opens in 12 days",
      "2 nights unlogged in the window",
      "5 ready, 2 marginal, 1 not ready",
      "Hard session Thursday",
    ];
    for (const text of clean) {
      expect(findSleepValueLeaks(text), text).toEqual([]);
    }
  });
});

describe("findSleepValueLeaksInPayload", () => {
  it("walks nested strings and names the path", () => {
    const leaks = findSleepValueLeaksInPayload({
      ok: "3 of 5 nights",
      athletes: [{ name: "A", line: "fine" }, { name: "B", line: "bed by 22:30" }],
    });
    expect(leaks).toHaveLength(1);
    expect(leaks[0]).toMatch(/athletes\[1\]\.line/);
  });

  it("rejects a key that names a sleep value even when the value is a number", () => {
    expect(findSleepValueLeaksInPayload({ actualSleepHours: 7 })).not.toEqual([]);
    expect(findSleepValueLeaksInPayload({ recommendedBedtime: "x" })).not.toEqual([]);
    expect(findSleepValueLeaksInPayload({ wakeAt: 1 })).not.toEqual([]);
  });

  it("is clean on a counts-only payload", () => {
    expect(
      findSleepValueLeaksInPayload({
        rosterSize: 6,
        onTrack: 4,
        shortNights: 3,
        compliance: 62,
        recommendation: "Train as planned.",
      }),
    ).toEqual([]);
  });
});
