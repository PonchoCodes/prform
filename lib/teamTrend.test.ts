import { describe, it, expect } from "vitest";
import {
  buildTeamTrend,
  teamTrendCountdownCopy,
  MIN_TEAM_NIGHTS,
  type MemberForTrend,
  type NightForTrend,
} from "@/lib/teamTrend";
import { findSleepValueLeaks, findSleepValueLeaksInPayload } from "@/lib/team/coachCopyGuard";

// Wednesday 2026-09-16. Current week starts Monday the 14th; last night is the 15th.
const TODAY = "2026-09-16";

const members: MemberForTrend[] = [
  { userId: "a", name: "Ada", joinedOn: "2026-07-01" },
  { userId: "b", name: "Ben", joinedOn: "2026-07-01" },
];

function night(userId: string, date: string, actual: number | null, hit: boolean | null, target = 8.5): NightForTrend {
  return { userId, date, actualSleepHours: actual, targetSleepHours: target, hitTarget: hit, needsReview: false };
}

describe("buildTeamTrend", () => {
  it("returns eight weeks oldest first, ending on the current week", () => {
    const t = buildTeamTrend({ members, nights: [], hardSessionDates: [], today: TODAY });
    expect(t.weeks).toHaveLength(8);
    expect(t.weeks[7].weekStart).toBe("2026-09-14");
    expect(t.weeks[0].weekStart).toBe("2026-07-27");
  });

  it("counts the current week only up to last night", () => {
    const t = buildTeamTrend({ members, nights: [], hardSessionDates: [], today: TODAY });
    // Mon 14th and Tue 15th, two athletes.
    expect(t.weeks[7].nightsPossible).toBe(4);
    expect(t.weeks[6].nightsPossible).toBe(14);
  });

  it("computes compliance over verdict nights and logging over possible nights", () => {
    const nights = [
      night("a", "2026-09-14", 8.6, true),
      night("a", "2026-09-15", 7.0, false),
      night("b", "2026-09-14", 8.5, true),
      // Ben did not log the 15th.
    ];
    const t = buildTeamTrend({ members, nights, hardSessionDates: [], today: TODAY });
    const week = t.weeks[7];
    expect(week.nightsLogged).toBe(3);
    expect(week.loggingRate).toBe(75);
    expect(week.compliance).toBe(67);
    expect(week.shortNights).toBe(1);
  });

  it("does not count nights before an athlete joined as possible", () => {
    const late: MemberForTrend[] = [{ userId: "c", name: "Cy", joinedOn: "2026-09-15" }];
    const t = buildTeamTrend({ members: late, nights: [], hardSessionDates: [], today: TODAY });
    expect(t.weeks[7].nightsPossible).toBe(1);
    expect(t.weeks[6].nightsPossible).toBe(0);
    expect(t.weeks[6].loggingRate).toBeNull();
  });

  it("keeps a flagged night as a check-in but not as a verdict or a short night", () => {
    const nights: NightForTrend[] = [
      { userId: "a", date: "2026-09-14", actualSleepHours: 27, targetSleepHours: 8.5, hitTarget: false, needsReview: true },
    ];
    const t = buildTeamTrend({ members, nights, hardSessionDates: [], today: TODAY });
    expect(t.weeks[7].nightsLogged).toBe(1);
    expect(t.weeks[7].compliance).toBeNull();
    expect(t.weeks[7].shortNights).toBe(0);
  });

  it("puts hard session dates into the week they fall in", () => {
    const t = buildTeamTrend({
      members,
      nights: [],
      hardSessionDates: ["2026-09-08", "2026-09-10", "2026-09-15", "2026-09-30"],
      today: TODAY,
    });
    expect(t.weeks[6].hardSessionDays).toEqual(["2026-09-08", "2026-09-10"]);
    expect(t.weeks[7].hardSessionDays).toEqual(["2026-09-15"]);
  });

  it("gives per-athlete rows for the current week", () => {
    const nights = [night("a", "2026-09-14", 8.6, true), night("a", "2026-09-15", 8.6, true)];
    const t = buildTeamTrend({ members, nights, hardSessionDates: [], today: TODAY });
    expect(t.athletes).toEqual([
      { name: "Ada", compliance: 100, loggingRate: 100, shortNights: 0, nightsLogged: 2, nightsPossible: 2 },
      { name: "Ben", compliance: null, loggingRate: 0, shortNights: 0, nightsLogged: 0, nightsPossible: 2 },
    ]);
  });

  it("counts down to the minimum and reports ready once it is met", () => {
    const few = buildTeamTrend({ members, nights: [night("a", "2026-09-14", 8.6, true)], hardSessionDates: [], today: TODAY });
    expect(few.ready).toBe(false);
    expect(few.nightsNeeded).toBe(MIN_TEAM_NIGHTS - 1);
    expect(teamTrendCountdownCopy(few)).toBe(`${MIN_TEAM_NIGHTS - 1} more logged nights across the team and the trend appears.`);

    const nights: NightForTrend[] = [];
    for (let i = 1; i <= 7; i++) {
      nights.push(night("a", `2026-09-0${i}`, 8.6, true));
      nights.push(night("b", `2026-09-0${i}`, 8.6, true));
    }
    const enough = buildTeamTrend({ members, nights, hardSessionDates: [], today: TODAY });
    expect(enough.ready).toBe(true);
    expect(teamTrendCountdownCopy(enough)).toBe("Your team trend is ready.");
  });

  it("carries no hours value in the payload, only rates and counts", () => {
    const nights = [night("a", "2026-09-14", 6.1, false), night("b", "2026-09-15", 9.25, true)];
    const t = buildTeamTrend({ members, nights, hardSessionDates: ["2026-09-15"], today: TODAY });
    expect(findSleepValueLeaksInPayload(t)).toEqual([]);
    expect(findSleepValueLeaks(teamTrendCountdownCopy(t))).toEqual([]);
  });
});
