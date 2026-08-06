import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { calculateSleepPlan, type UserInput, type MeetInput } from "@/lib/sleepAlgorithm";

// calculateSleepPlan logs a per-day shift trace on every call. Useful in a
// request log, unreadable across a few hundred assertions.
let logSpy: ReturnType<typeof vi.spyOn>;
beforeAll(() => { logSpy = vi.spyOn(console, "log").mockImplementation(() => {}); });
afterAll(() => { logSpy.mockRestore(); });

/**
 * A 17-year-old wakes at 07:00 by default and needs 9.25 h (AASM bracket plus
 * athlete overhead), so an ordinary night lands at a 21:45 bedtime. Every
 * expectation below is derived from that.
 */
function baseUser(overrides: Partial<UserInput> = {}): UserInput {
  return {
    age: 17,
    biologicalSex: "male",
    currentWakeTime: "07:00",
    currentBedTime: "22:30",
    ...overrides,
  };
}

/**
 * Mirrors the function's own date-key arithmetic exactly — local midnight, read
 * back in UTC components — so the keys line up wherever the test host happens
 * to be.
 */
function dateKey(dayOffset: number): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + dayOffset),
  )
    .toISOString()
    .slice(0, 10);
}

function meetInDays(days: number, overrides: Partial<MeetInput> = {}): MeetInput {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + days),
  );
  return { date: d, priority: "A", name: "State Championships", raceTime: "09:00", ...overrides };
}

describe("wake anchor", () => {
  it("counts bedtime back from the athlete's default when nothing is declared", () => {
    const [today] = calculateSleepPlan(baseUser(), [], []);

    expect(today.recommendedWakeTime).toBe("07:00");
    expect(today.recommendedBedtime).toBe("21:45"); // 07:00 minus 9.25 h
    expect(today.declaredWakeTime).toBeNull();
    expect(today.totalSleepHours).toBe(9.3);
    expect(today.achievableSleepHours).toBe(9.3);
    expect(today.sleepShortfallMinutes).toBe(0);
  });

  it("counts bedtime back from the declared wake instead", () => {
    const plans = calculateSleepPlan(baseUser(), [], [], undefined, {
      declaredWakeByDate: { [dateKey(0)]: "05:30" },
    });

    expect(plans[0].declaredWakeTime).toBe("05:30");
    expect(plans[0].recommendedWakeTime).toBe("05:30");
    expect(plans[0].recommendedBedtime).toBe("20:15"); // 05:30 minus 9.25 h
    // Still reachable, so the target is met in full and nothing is flagged.
    expect(plans[0].achievableSleepHours).toBe(9.3);
    expect(plans[0].sleepShortfallMinutes).toBe(0);
  });

  it("applies a declaration only to the day it was made for", () => {
    const plans = calculateSleepPlan(baseUser(), [], [], undefined, {
      declaredWakeByDate: { [dateKey(1)]: "05:30" },
    });

    expect(plans[0].declaredWakeTime).toBeNull();
    expect(plans[0].recommendedWakeTime).toBe("07:00");
    expect(plans[1].declaredWakeTime).toBe("05:30");
    expect(plans[1].recommendedWakeTime).toBe("05:30");
    expect(plans[2].recommendedWakeTime).toBe("07:00");
  });

  it("falls back to the default when the declaration cannot be parsed", () => {
    const control = calculateSleepPlan(baseUser(), [], []);

    // Every one of these is something a parser could hand over on a bad day.
    // "5" is deliberately included: normalizing it to "05:00" is the message
    // parser's job, and an un-normalized value must not be guessed at here.
    for (const bad of ["half five", "25:00", "07:60", "5", "", "7:0"]) {
      const plans = calculateSleepPlan(baseUser(), [], [], undefined, {
        declaredWakeByDate: { [dateKey(0)]: bad },
      });
      expect(plans[0].declaredWakeTime, `input: ${JSON.stringify(bad)}`).toBeNull();
      expect(plans[0].recommendedWakeTime).toBe(control[0].recommendedWakeTime);
      expect(plans[0].recommendedBedtime).toBe(control[0].recommendedBedtime);
      expect(Number.isFinite(plans[0].achievableSleepHours)).toBe(true);
    }
  });
});

describe("unreachable targets", () => {
  it("names the shortfall instead of printing a bedtime before 20:00", () => {
    const plans = calculateSleepPlan(baseUser(), [], [], undefined, {
      declaredWakeByDate: { [dateKey(0)]: "03:00" },
    });
    const day = plans[0];

    // 03:00 minus 9.25 h is 17:45. The floor moves it to 20:00 — and the whole
    // point of this change is that the 2.25 h lost on the way is now reported
    // rather than absorbed in silence.
    expect(day.recommendedBedtime).toBe("20:00");
    expect(day.totalSleepHours).toBe(9.3);
    expect(day.achievableSleepHours).toBe(7);
    expect(day.sleepShortfallMinutes).toBe(135);
  });

  it("accounts for the 45-min shift limit on a night that follows a normal one", () => {
    // The real flow: the evening question is about tomorrow, so yesterday's
    // bedtime is already set and the shift limit binds before the floor does.
    const plans = calculateSleepPlan(baseUser(), [], [], undefined, {
      declaredWakeByDate: { [dateKey(1)]: "03:00" },
    });

    expect(plans[0].recommendedBedtime).toBe("21:45");
    // 45 min earlier than yesterday is as far as a bedtime can move in a night.
    expect(plans[1].recommendedBedtime).toBe("21:00");
    expect(plans[1].achievableSleepHours).toBe(6);
    expect(plans[1].sleepShortfallMinutes).toBe(195); // 3h15 — "about 3 hours short"
  });

  it("never reports a negative shortfall or a night longer than the target", () => {
    for (const wake of ["03:00", "04:15", "05:30", "07:00", "08:30", "23:00"]) {
      const plans = calculateSleepPlan(baseUser(), [], [], undefined, {
        declaredWakeByDate: { [dateKey(0)]: wake },
      });
      const day = plans[0];
      expect(day.sleepShortfallMinutes, `wake: ${wake}`).toBeGreaterThanOrEqual(0);
      expect(day.achievableSleepHours).toBeLessThanOrEqual(day.totalSleepHours);
      // A missing or absurd anchor must never produce a 27-hour night.
      expect(day.achievableSleepHours).toBeGreaterThanOrEqual(0);
      expect(day.achievableSleepHours).toBeLessThan(14);
    }
  });
});

describe("the circadian model is untouched by a declaration", () => {
  const user = baseUser();
  const meets = [meetInDays(5)];

  it("leaves the phase-response plan and the meet ramp identical", () => {
    const control = calculateSleepPlan(user, meets, []);
    const declared = calculateSleepPlan(user, meets, [], undefined, {
      declaredWakeByDate: { [dateKey(5)]: "03:00" },
    });

    const c = control[5].circadian;
    const d = declared[5].circadian;
    expect(c).not.toBeNull();
    expect(d).not.toBeNull();

    // Setting an alarm does not move a circadian pacemaker, so every value the
    // PRC engine derives from body-clock phase has to be unchanged: CBTmin, the
    // advance/delay zone boundaries, the prescribed light exposure, and the
    // size of the shift applied so far.
    expect(d!.cbtMin).toBe(c!.cbtMin);
    expect(d!.advanceWindowStart).toBe(c!.advanceWindowStart);
    expect(d!.advanceWindowEnd).toBe(c!.advanceWindowEnd);
    expect(d!.delayZoneEnd).toBe(c!.delayZoneEnd);
    expect(d!.lightExposure).toEqual(c!.lightExposure);
    expect(d!.dailyShiftMin).toBe(c!.dailyShiftMin);
    expect(d!.cumulativeShiftMin).toBe(c!.cumulativeShiftMin);
    expect(d!.targetWakeTime).toBe(c!.targetWakeTime);
    expect(declared[5].preRaceShiftMinutes).toBe(control[5].preRaceShiftMinutes);

    // The sleep need itself is a function of age, load and meet proximity —
    // none of which a declared wake time changes.
    expect(declared[5].totalSleepHours).toBe(control[5].totalSleepHours);
  });

  it("still tracks the wind-down and light-avoidance windows to the real bedtime", () => {
    const declared = calculateSleepPlan(user, meets, [], undefined, {
      declaredWakeByDate: { [dateKey(5)]: "03:00" },
    })[5];

    // These two legitimately move with the bedtime — "dim the lights three
    // hours before bed" means the bed the athlete is actually going to.
    expect(declared.windDown.phase3 < declared.recommendedBedtime).toBe(true);
    expect(declared.circadian!.lightAvoidStart).not.toBe(declared.recommendedBedtime);
  });
});
