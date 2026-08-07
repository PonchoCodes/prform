import { describe, it, expect } from "vitest";
import {
  activeInFourthWeek,
  buildCohorts,
  buildGroupRollups,
  buildWeeklyActive,
  longestConsecutiveRun,
  type UserForRetention,
} from "@/lib/retention";

// 2026-08-03 is a Monday. "Today" is 2026-08-31, a Monday four weeks later,
// so a cohort that signed up in the week of 2026-06-29 is old enough to be
// measured at four weeks and one from 2026-08-24 is not.
const TODAY = "2026-08-31";

function range(from: string, to: string): string[] {
  const out: string[] = [];
  const cursor = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  while (cursor <= end) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

function user(overrides: Partial<UserForRetention> = {}): UserForRetention {
  return {
    id: "u1",
    createdOn: "2026-08-03",
    onboardingCompletedOn: "2026-08-03",
    loggedDates: [],
    teamIds: [],
    ...overrides,
  };
}

describe("longestConsecutiveRun", () => {
  it("is zero with no history", () => {
    expect(longestConsecutiveRun([])).toBe(0);
  });

  it("counts an unbroken run", () => {
    expect(longestConsecutiveRun(range("2026-08-03", "2026-08-09"))).toBe(7);
  });

  it("is strict: a single gap resets it", () => {
    // No forgiveness and no holds. The athlete-facing streak is generous on
    // purpose; a retention number that inherited that generosity would report a
    // habit that had not formed, which is the one thing this page exists to
    // find out.
    const withGap = ["2026-08-03", "2026-08-04", "2026-08-06", "2026-08-07"];
    expect(longestConsecutiveRun(withGap)).toBe(2);
  });

  it("finds the best run, not the most recent", () => {
    const dates = [...range("2026-06-01", "2026-06-10"), "2026-08-03"];
    expect(longestConsecutiveRun(dates)).toBe(10);
  });

  it("is unmoved by duplicates and by order", () => {
    expect(longestConsecutiveRun(["2026-08-04", "2026-08-03", "2026-08-03"])).toBe(2);
  });
});

describe("activeInFourthWeek", () => {
  it("counts a night inside days 21 to 27", () => {
    expect(
      activeInFourthWeek(user({ createdOn: "2026-08-03", loggedDates: ["2026-08-25"] })),
    ).toBe(true); // day 22
  });

  it("does not count the first three weeks", () => {
    // The step has to mean "still logging a month in". An account that signed
    // up, logged for three days and vanished must not clear it.
    expect(
      activeInFourthWeek(
        user({ createdOn: "2026-08-03", loggedDates: range("2026-08-03", "2026-08-05") }),
      ),
    ).toBe(false);
  });

  it("does not count activity past the fourth week either", () => {
    expect(
      activeInFourthWeek(user({ createdOn: "2026-08-03", loggedDates: ["2026-09-10"] })),
    ).toBe(false);
  });
});

describe("buildCohorts", () => {
  it("groups by the Monday of the signup week", () => {
    const cohorts = buildCohorts(
      [
        user({ id: "a", createdOn: "2026-08-03" }), // Monday
        user({ id: "b", createdOn: "2026-08-09" }), // the Sunday of the same week
        user({ id: "c", createdOn: "2026-08-10" }), // the next Monday
      ],
      TODAY,
    );

    expect(cohorts.map((c) => c.weekStart)).toEqual(["2026-08-10", "2026-08-03"]);
    expect(cohorts.find((c) => c.weekStart === "2026-08-03")!.signedUp).toBe(2);
  });

  it("puts the newest cohort first", () => {
    const cohorts = buildCohorts(
      [user({ id: "a", createdOn: "2026-06-01" }), user({ id: "b", createdOn: "2026-08-03" })],
      TODAY,
    );
    expect(cohorts[0].weekStart).toBe("2026-08-03");
  });

  it("narrows at every step, and never widens", () => {
    const cohorts = buildCohorts(
      [
        // Signed up, never onboarded.
        user({ id: "a", createdOn: "2026-06-29", onboardingCompletedOn: null }),
        // Onboarded, never logged.
        user({ id: "b", createdOn: "2026-06-29" }),
        // Logged, but never seven in a row and gone by week four.
        user({ id: "c", createdOn: "2026-06-29", loggedDates: ["2026-06-30", "2026-07-02"] }),
        // The full journey.
        user({
          id: "d",
          createdOn: "2026-06-29",
          loggedDates: [...range("2026-06-29", "2026-07-05"), "2026-07-22"],
        }),
      ],
      TODAY,
    );

    const c = cohorts[0];
    expect(c.signedUp).toBe(4);
    expect(c.completedOnboarding).toBe(3);
    expect(c.firstSleepLog).toBe(2);
    expect(c.sevenConsecutiveDays).toBe(1);
    expect(c.fourWeeks).toBe(1);

    // A funnel whose steps can cross over is one nobody can read.
    expect(c.completedOnboarding).toBeLessThanOrEqual(c.signedUp);
    expect(c.firstSleepLog).toBeLessThanOrEqual(c.completedOnboarding);
    expect(c.sevenConsecutiveDays).toBeLessThanOrEqual(c.firstSleepLog);
    expect(c.fourWeeks).toBeLessThanOrEqual(c.firstSleepLog);
  });

  it("does not count an athlete who skipped onboarding but logged anyway", () => {
    // They are real, and they are excluded from the later steps on purpose:
    // each step is a subset of the one above it, or the shape stops being a
    // funnel.
    const cohorts = buildCohorts(
      [
        user({
          id: "a",
          createdOn: "2026-06-29",
          onboardingCompletedOn: null,
          loggedDates: range("2026-06-29", "2026-07-10"),
        }),
      ],
      TODAY,
    );
    expect(cohorts[0].completedOnboarding).toBe(0);
    expect(cohorts[0].firstSleepLog).toBe(0);
  });

  it("marks a cohort too young to have reached four weeks", () => {
    // The bug this prevents: a cohort that signed up last Tuesday showing 0% at
    // four weeks, read as a collapse in retention rather than as arithmetic
    // that has not happened yet.
    const cohorts = buildCohorts(
      [
        user({ id: "young", createdOn: "2026-08-24" }),
        user({ id: "old", createdOn: "2026-06-29" }),
      ],
      TODAY,
    );

    expect(cohorts.find((c) => c.weekStart === "2026-08-24")!.fourWeeksMeasurable).toBe(false);
    expect(cohorts.find((c) => c.weekStart === "2026-06-29")!.fourWeeksMeasurable).toBe(true);
  });
});

describe("buildWeeklyActive", () => {
  it("counts an athlete who logged at least one night that week", () => {
    const weeks = buildWeeklyActive(
      [
        user({ id: "a", loggedDates: ["2026-08-26"] }),
        user({ id: "b", loggedDates: ["2026-08-27", "2026-08-28"] }),
        user({ id: "c", loggedDates: [] }),
      ],
      TODAY,
      2,
    );

    // Week beginning 2026-08-24 contains all three of those dates.
    const lastWeek = weeks.find((w) => w.weekStart === "2026-08-24")!;
    expect(lastWeek.active).toBe(2);
  });

  it("counts a person once however many nights they logged", () => {
    const weeks = buildWeeklyActive(
      [user({ id: "a", loggedDates: range("2026-08-24", "2026-08-30") })],
      TODAY,
      2,
    );
    expect(weeks.find((w) => w.weekStart === "2026-08-24")!.active).toBe(1);
  });

  it("returns the requested number of weeks, newest first", () => {
    const weeks = buildWeeklyActive([user()], TODAY, 4);
    expect(weeks).toHaveLength(4);
    expect(weeks[0].weekStart).toBe("2026-08-31");
    expect(weeks[3].weekStart).toBe("2026-08-10");
  });
});

describe("buildGroupRollups", () => {
  const teamNames = new Map([
    ["t1", "Kestrel Hollow"],
    ["t2", "Vermillion Ridge"],
  ]);

  it("rolls up each team and puts solo users in their own row", () => {
    const rows = buildGroupRollups(
      [
        user({ id: "a", teamIds: ["t1"], loggedDates: range("2026-08-25", "2026-08-31") }),
        user({ id: "b", teamIds: ["t1"], loggedDates: [] }),
        user({ id: "c", teamIds: ["t2"], loggedDates: ["2026-08-30"] }),
        user({ id: "d", teamIds: [], loggedDates: ["2026-08-30"] }),
      ],
      teamNames,
      TODAY,
    );

    const t1 = rows.find((r) => r.teamId === "t1")!;
    expect(t1.members).toBe(2);
    expect(t1.everLogged).toBe(1);
    expect(t1.habitFormed).toBe(1);

    const solo = rows.find((r) => r.teamId === null)!;
    expect(solo.label).toBe("Solo (no team)");
    expect(solo.members).toBe(1);
  });

  it("counts an athlete on two teams in both", () => {
    // Not a partition, and not meant to be: the question each row answers is
    // "how is this team doing", and they are on it.
    const rows = buildGroupRollups(
      [user({ id: "a", teamIds: ["t1", "t2"], loggedDates: ["2026-08-30"] })],
      teamNames,
      TODAY,
    );
    expect(rows.find((r) => r.teamId === "t1")!.members).toBe(1);
    expect(rows.find((r) => r.teamId === "t2")!.members).toBe(1);
    expect(rows.find((r) => r.teamId === null)!.members).toBe(0);
  });

  it("averages nights over the last 28 days across all members, not just active ones", () => {
    // Dividing by the active members instead of the roster is how a team with
    // one keen athlete and nine absent ones reports a perfect average.
    const rows = buildGroupRollups(
      [
        user({ id: "a", teamIds: ["t1"], loggedDates: range("2026-08-25", "2026-08-31") }),
        user({ id: "b", teamIds: ["t1"], loggedDates: [] }),
      ],
      teamNames,
      TODAY,
    );
    expect(rows.find((r) => r.teamId === "t1")!.avgNightsLast28).toBe(3.5);
  });

  it("puts the solo row last, after the biggest teams", () => {
    const rows = buildGroupRollups([user({ id: "a", teamIds: ["t1"] })], teamNames, TODAY);
    expect(rows[rows.length - 1].teamId).toBeNull();
  });
});
