import { describe, it, expect } from "vitest";
import {
  computeSleepDebtMinutes,
  computeVerdict,
  formatSleepDebt,
  formatShortfall,
  type VerdictInput,
} from "@/lib/verdict";
import { pacesFromVdot } from "@/lib/vdot";

const PACES = pacesFromVdot(50);

/** A rested athlete, paces resolved from a PR, nothing on the calendar. */
function baseInput(overrides: Partial<VerdictInput> = {}): VerdictInput {
  return {
    paces: PACES,
    paceSourceKind: "pr",
    unit: "imperial",
    stravaConnected: true,
    totalSleepHours: 8.5,
    sleepShortfallMinutes: 0,
    achievableSleepHours: 8.5,
    recoveryScore: 82,
    trainingLoadLevel: "low",
    tomorrowLoadLevel: null,
    daysUntilNextMeet: null,
    nextMeetName: null,
    nextMeetPriority: null,
    tsb: 4,
    sleepDebtMinutes: 0,
    nightsLogged: 12,
    ...overrides,
  };
}

/** The rule the whole component rests on: a verdict without a number isn't one. */
const HAS_NUMBER = /\d/;

describe("computeVerdict", () => {
  it("prescribes the session when the athlete is rested and today is hard", () => {
    const v = computeVerdict(baseInput({ trainingLoadLevel: "high" }));
    expect(v.kind).toBe("go_hard");
    expect(v.verdict).toMatch(/intervals/i);
    expect(v.confidence).toBe("high");
  });

  it("explains an easy day by tomorrow's hard session when there is one", () => {
    const rested = baseInput({ trainingLoadLevel: "low", tomorrowLoadLevel: "high" });
    const v = computeVerdict(rested);
    expect(v.kind).toBe("easy");
    expect(v.reason).toMatch(/tomorrow is the hard session/i);

    // Same day, nothing tomorrow — same instruction, different justification.
    const quiet = computeVerdict({ ...rested, tomorrowLoadLevel: "low" });
    expect(quiet.verdict).toBe(v.verdict);
    expect(quiet.reason).not.toBe(v.reason);
  });

  it("overrides a hard session when the athlete is down on sleep", () => {
    const v = computeVerdict(
      baseInput({ trainingLoadLevel: "high", sleepDebtMinutes: 130, recoveryScore: 71 }),
    );
    expect(v.kind).toBe("back_off");
    expect(v.verdict).toMatch(/run easy today/i);
    expect(v.reason).toContain("2h10");
  });

  it("names sleep debt ahead of recovery and TSB when several signals flag at once", () => {
    const v = computeVerdict(
      baseInput({ trainingLoadLevel: "high", sleepDebtMinutes: 90, recoveryScore: 40, tsb: -25 }),
    );
    expect(v.reason).toContain("1h30");
    expect(v.reason).not.toContain("/100");
  });

  it("falls back to recovery, then TSB, when sleep is on target", () => {
    const byRecovery = computeVerdict(baseInput({ recoveryScore: 45, tsb: 2 }));
    expect(byRecovery.kind).toBe("recover");
    expect(byRecovery.reason).toContain("45/100");

    const byTsb = computeVerdict(baseInput({ recoveryScore: 78, tsb: -22 }));
    expect(byTsb.kind).toBe("recover");
    expect(byTsb.reason).toContain("-22");
  });

  it("tapers inside the week before an A race", () => {
    const v = computeVerdict(
      baseInput({
        trainingLoadLevel: "high",
        daysUntilNextMeet: 4,
        nextMeetName: "State Championships",
        nextMeetPriority: "A",
      }),
    );
    expect(v.kind).toBe("taper");
    expect(v.verdict).toMatch(/cut the volume/i);
    expect(v.reason).toContain("State Championships");
    expect(v.reason).toContain("4 days");
    // The strides pace is real advice, but a headline carries one instruction.
    expect(v.reason).toMatch(/strides at \d{1,2}:\d{2}\/mi/);
  });

  it("does not taper for a C race", () => {
    const v = computeVerdict(
      baseInput({ trainingLoadLevel: "high", daysUntilNextMeet: 4, nextMeetPriority: "C" }),
    );
    expect(v.kind).toBe("go_hard");
  });

  it("puts the last controllable lever first the day before a race", () => {
    const v = computeVerdict(
      baseInput({ daysUntilNextMeet: 1, nextMeetName: "Regionals", nextMeetPriority: "A" }),
    );
    expect(v.kind).toBe("race_tomorrow");
    expect(v.verdict).toMatch(/20 easy minutes/i);
    // Sleep is the point of the day, but it belongs in the reason — Tonight's
    // Target owns the number.
    expect(v.reason).toContain("Regionals");
    expect(v.reason).toMatch(/tonight's sleep/i);
  });

  it("keeps race day to a shakeout", () => {
    const v = computeVerdict(
      baseInput({ daysUntilNextMeet: 0, nextMeetName: "Regionals", nextMeetPriority: "A" }),
    );
    expect(v.kind).toBe("race_day");
    expect(v.verdict).toMatch(/shake out/i);
    expect(v.reason).toContain("Regionals");
  });

  it("lets a race outrank fatigue", () => {
    const v = computeVerdict(
      baseInput({ daysUntilNextMeet: 0, sleepDebtMinutes: 200, recoveryScore: 30 }),
    );
    expect(v.kind).toBe("race_day");
  });

  it("honours metric paces", () => {
    const v = computeVerdict(baseInput({ unit: "metric", trainingLoadLevel: "high" }));
    expect(v.verdict).toContain("/km");
    expect(v.verdict).not.toContain("/mi");
  });
});

describe("computeVerdict — degraded states", () => {
  it("falls back to the sleep target when no VDOT can be resolved, and asks for a PR", () => {
    const v = computeVerdict(
      baseInput({ paces: null, paceSourceKind: "none", stravaConnected: true }),
    );
    expect(v.kind).toBe("needs_pr");
    expect(v.verdict).toContain("8.5h");
    expect(v.action).toEqual({ label: "Add a race PR", target: "pr" });
    expect(v.confidence).toBe("low");
  });

  it("names both missing inputs when Strava is not connected either", () => {
    const v = computeVerdict(
      baseInput({ paces: null, paceSourceKind: "none", stravaConnected: false, nightsLogged: 0 }),
    );
    expect(v.kind).toBe("needs_pr");
    expect(v.reason).toMatch(/connect strava/i);
    expect(v.action?.target).toBe("pr");
  });

  it("gives a full pace verdict on a declared PR alone, before any Strava history", () => {
    const v = computeVerdict(
      baseInput({
        stravaConnected: false,
        paceSourceKind: "pr",
        tsb: null,
        sleepDebtMinutes: null,
        nightsLogged: 0,
        trainingLoadLevel: "medium",
      }),
    );
    expect(v.kind).toBe("threshold");
    expect(v.verdict).toMatch(HAS_NUMBER);
    // Sleep is unlogged, so the ask is a sleep log — not the missing Strava.
    expect(v.action).toEqual({ label: "Log last night's sleep", target: "log_sleep" });
  });

  it("asks for Strava once sleep is being logged but there is no training history", () => {
    const v = computeVerdict(baseInput({ stravaConnected: false, nightsLogged: 6, tsb: null }));
    expect(v.action).toEqual({ label: "Connect Strava", target: "strava" });
  });

  it("does not claim fatigue it cannot see", () => {
    // No sleep logs and no Strava: every fatigue signal is null or default.
    const v = computeVerdict(
      baseInput({
        trainingLoadLevel: "high",
        tsb: null,
        sleepDebtMinutes: null,
        nightsLogged: 0,
        recoveryScore: 75,
      }),
    );
    expect(v.kind).toBe("go_hard");
  });

  it("downgrades confidence while the sleep record is thin", () => {
    expect(computeVerdict(baseInput({ nightsLogged: 0 })).confidence).toBe("medium");
    expect(computeVerdict(baseInput({ nightsLogged: 4 })).confidence).toBe("medium");
    expect(computeVerdict(baseInput({ nightsLogged: 5 })).confidence).toBe("high");
    expect(
      computeVerdict(baseInput({ paceSourceKind: "observed", nightsLogged: 0 })).confidence,
    ).toBe("low");
  });
});

describe("every reachable verdict carries a number", () => {
  const states: [string, VerdictInput][] = [
    ["no paces", baseInput({ paces: null, paceSourceKind: "none" })],
    ["race day", baseInput({ daysUntilNextMeet: 0 })],
    ["race tomorrow", baseInput({ daysUntilNextMeet: 1 })],
    ["back off", baseInput({ trainingLoadLevel: "high", sleepDebtMinutes: 120 })],
    ["recover", baseInput({ recoveryScore: 40 })],
    ["taper", baseInput({ daysUntilNextMeet: 5, nextMeetPriority: "A" })],
    ["go hard", baseInput({ trainingLoadLevel: "high" })],
    ["threshold", baseInput({ trainingLoadLevel: "medium" })],
    ["easy", baseInput()],
    [
      "short night",
      baseInput({ sleepShortfallMinutes: 195, achievableSleepHours: 6 }),
    ],
  ];

  const seen = new Set<string>();

  for (const [name, input] of states) {
    it(`${name}: verdict states a pace or a time`, () => {
      const v = computeVerdict(input);
      seen.add(v.kind);
      expect(v.verdict, `"${v.verdict}"`).toMatch(HAS_NUMBER);
      expect(v.reason.length).toBeGreaterThan(0);
      expect(v.verdict).not.toMatch(/--/); // an unformattable pace leaked through
    });
  }

  for (const [name, input] of states) {
    it(`${name}: headline carries no clock time`, () => {
      const v = computeVerdict(input);
      // Bedtime and wake time belong to Tonight's Target, which renders them
      // once. A "10:15 PM" in the headline is the duplication this guards.
      expect(v.verdict, `"${v.verdict}"`).not.toMatch(/\d{1,2}:\d{2}\s?(AM|PM)/i);
    });

    it(`${name}: every nowrap token occurs in the headline`, () => {
      const v = computeVerdict(input);
      for (const token of v.nowrap) {
        expect(v.verdict, `token "${token}" missing`).toContain(token);
      }
    });
  }

  it("marks the pace as unbreakable wherever one is prescribed", () => {
    const withPace = computeVerdict(baseInput({ trainingLoadLevel: "high" }));
    expect(withPace.nowrap).toHaveLength(1);
    expect(withPace.nowrap[0]).toMatch(/^\d{1,2}:\d{2}\/mi$/);

    const range = computeVerdict(baseInput());
    expect(range.nowrap[0]).toMatch(/^\d{1,2}:\d{2}–\d{1,2}:\d{2}\/mi$/);
  });

  it("keeps every nowrap token inside the headline's 16ch cap", () => {
    // A slow athlete produces the widest token: two-digit minutes both sides.
    const slow = [...states, ["slow athlete", baseInput({ paces: pacesFromVdot(30) })] as const];
    for (const [name, input] of slow) {
      for (const token of computeVerdict(input).nowrap) {
        expect(token.length, `${name}: "${token}"`).toBeLessThanOrEqual(16);
      }
    }
  });

  it("keeps every headline short enough to stay under four lines at 16ch", () => {
    for (const [name, input] of states) {
      const v = computeVerdict(input);
      expect(v.verdict.length, `${name}: "${v.verdict}"`).toBeLessThanOrEqual(42);
    }
  });

  it("covers every branch of the ladder", () => {
    expect(seen).toEqual(
      new Set([
        "short_night",
        "needs_pr",
        "race_day",
        "race_tomorrow",
        "back_off",
        "recover",
        "taper",
        "go_hard",
        "threshold",
        "easy",
      ]),
    );
  });
});

describe("computeSleepDebtMinutes", () => {
  it("prefers hours-against-target when the night was logged with one", () => {
    const debt = computeSleepDebtMinutes([
      { targetSleepHours: 8.5, actualSleepHours: 7.0 }, // 90 down
      { targetSleepHours: 8.5, actualSleepHours: 8.0 }, // 30 down
    ]);
    expect(debt).toBe(120);
  });

  it("falls back to bedtime deviation for nights logged without a target", () => {
    const debt = computeSleepDebtMinutes([
      { recommendedBedtime: "22:00", actualBedtime: "23:00", hitTarget: false },
      { recommendedBedtime: "22:00", hitTarget: true },
    ]);
    expect(debt).toBe(60);
  });

  it("handles a bedtime that crosses midnight", () => {
    const debt = computeSleepDebtMinutes([
      { recommendedBedtime: "23:30", actualBedtime: "00:45", hitTarget: false },
    ]);
    expect(debt).toBe(75);
  });

  it("ignores nights inside the reporting deadband", () => {
    const debt = computeSleepDebtMinutes([
      { targetSleepHours: 8.5, actualSleepHours: 8.3 }, // 12 min — noise
      { targetSleepHours: 8.5, actualSleepHours: 8.4 },
    ]);
    expect(debt).toBe(0);
  });

  it("does not let a long night repay an earlier short one", () => {
    const debt = computeSleepDebtMinutes([
      { targetSleepHours: 8.5, actualSleepHours: 6.5 }, // 120 down
      { targetSleepHours: 8.5, actualSleepHours: 10.5 }, // 120 over
    ]);
    expect(debt).toBe(120);
  });

  it("returns null rather than zero when nothing can be scored", () => {
    expect(computeSleepDebtMinutes([])).toBeNull();
    expect(computeSleepDebtMinutes([{ recommendedBedtime: "22:00" }])).toBeNull();
    // Zero is a real answer and must be distinguishable from "no data".
    expect(computeSleepDebtMinutes([{ hitTarget: true }])).toBe(0);
  });
});

describe("formatSleepDebt", () => {
  it("reads the way an athlete would say it", () => {
    expect(formatSleepDebt(45)).toBe("45min");
    expect(formatSleepDebt(60)).toBe("1h");
    expect(formatSleepDebt(130)).toBe("2h10");
    expect(formatSleepDebt(125)).toBe("2h05");
    expect(formatSleepDebt(-10)).toBe("0min");
  });
});

describe("an unreachable target", () => {
  /** Up at 03:00, which leaves 6h against a 9.3h need. */
  function shortNight(overrides: Partial<VerdictInput> = {}): VerdictInput {
    return baseInput({
      totalSleepHours: 9.3,
      sleepShortfallMinutes: 195,
      achievableSleepHours: 6,
      ...overrides,
    });
  }

  it("names the shortfall and moves tomorrow's session", () => {
    const v = computeVerdict(shortNight());
    expect(v.kind).toBe("short_night");
    expect(v.verdict).toBe("You'll be about 3.5 hours short tonight.");
    expect(v.reason).toMatch(/6h against a 9\.3h target/);
    expect(v.reason).toMatch(/tomorrow's threshold|aerobic/i);
  });

  it("never prints a bedtime, which is the thing it exists to replace", () => {
    const v = computeVerdict(shortNight());
    expect(`${v.verdict} ${v.reason}`).not.toMatch(/\d{1,2}:\d{2}/);
  });

  it("outranks every other branch, including race day", () => {
    // The ordering the athlete's own answer earns: they told us when they are
    // getting up, and that fact survives contact with everything else.
    const cases: [string, Partial<VerdictInput>][] = [
      ["race day", { daysUntilNextMeet: 0 }],
      ["race tomorrow", { daysUntilNextMeet: 1 }],
      ["taper", { daysUntilNextMeet: 5, nextMeetPriority: "A" }],
      ["hard session", { trainingLoadLevel: "high" }],
      ["accumulated debt", { sleepDebtMinutes: 300 }],
      ["flat recovery", { recoveryScore: 30 }],
      ["deep fatigue", { tsb: -40 }],
    ];
    for (const [name, overrides] of cases) {
      expect(computeVerdict(shortNight(overrides)).kind, name).toBe("short_night");
    }
  });

  it("outranks the no-PR state, whose headline would otherwise be impossible", () => {
    // needs_pr leads with "Sleep 9.3h tonight." — a number we already know
    // cannot happen. The PR nudge survives as the action.
    const v = computeVerdict(shortNight({ paces: null, paceSourceKind: "none" }));
    expect(v.kind).toBe("short_night");
    expect(v.verdict).not.toMatch(/^Sleep /);
    expect(v.action).toEqual({ label: "Add a race PR", target: "pr" });
  });

  it("stays out of the way on an ordinary night", () => {
    expect(computeVerdict(baseInput({ sleepShortfallMinutes: 0 })).kind).not.toBe("short_night");
    expect(computeVerdict(baseInput({ sleepShortfallMinutes: null })).kind).not.toBe(
      "short_night",
    );
    // Under the hour, this is noise rather than a night worth rewriting a
    // training plan over.
    expect(computeVerdict(baseInput({ sleepShortfallMinutes: 59 })).kind).not.toBe(
      "short_night",
    );
  });

  it("fires at exactly the hour, matching the accumulated-debt threshold", () => {
    // The two signals have to agree about what an hour down means, or the same
    // lost sleep sits on opposite sides of two different lines.
    expect(computeVerdict(baseInput({ sleepShortfallMinutes: 60 })).kind).toBe("short_night");
  });

  it("still says something useful when the achievable hours are unknown", () => {
    const v = computeVerdict(shortNight({ achievableSleepHours: null }));
    expect(v.kind).toBe("short_night");
    expect(v.verdict).toMatch(/3\.5 hours/);
    expect(v.reason.length).toBeGreaterThan(0);
  });
});

describe("formatShortfall", () => {
  it("rounds to the half hour, which is the precision the model has", () => {
    expect(formatShortfall(60)).toBe("1 hour");
    expect(formatShortfall(90)).toBe("1.5 hours");
    expect(formatShortfall(135)).toBe("2.5 hours");
    expect(formatShortfall(180)).toBe("3 hours");
    expect(formatShortfall(195)).toBe("3.5 hours");
    expect(formatShortfall(30)).toBe("30 minutes");
    expect(formatShortfall(0)).toBe("0 minutes");
    expect(formatShortfall(-30)).toBe("0 minutes");
  });
});
