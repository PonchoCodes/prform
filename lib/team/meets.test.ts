import { describe, it, expect } from "vitest";
import { mergeMeetsForPlan, TEAM_MEET_PRIORITY } from "@/lib/team/meets";

const d = (key: string) => new Date(`${key}T00:00:00.000Z`);

describe("mergeMeetsForPlan", () => {
  it("turns a team meet into a MeetInput at the team priority, with no race time", () => {
    const merged = mergeMeetsForPlan([], [{ date: d("2026-10-03"), name: "Conference" }]);
    expect(merged).toEqual([
      { date: d("2026-10-03"), priority: TEAM_MEET_PRIORITY, name: "Conference", raceTime: null },
    ]);
  });

  it("keeps the athlete's own meet when both fall on the same date", () => {
    const merged = mergeMeetsForPlan(
      [{ date: d("2026-10-03"), priority: "A", name: "My A race", raceTime: "10:00" }],
      [{ date: d("2026-10-03"), name: "Conference" }],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].name).toBe("My A race");
    expect(merged[0].priority).toBe("A");
    expect(merged[0].raceTime).toBe("10:00");
  });

  it("interleaves by date so the plan sees the nearest meet first", () => {
    const merged = mergeMeetsForPlan(
      [{ date: d("2026-11-01"), priority: "C", name: "Late own" }],
      [
        { date: d("2026-10-20"), name: "Mid team" },
        { date: d("2026-10-05"), name: "Early team" },
      ],
    );
    expect(merged.map((m) => m.name)).toEqual(["Early team", "Mid team", "Late own"]);
  });

  it("matches on calendar date, not instant, so a meet stored at local midnight still collides", () => {
    const merged = mergeMeetsForPlan(
      [{ date: new Date("2026-10-03T05:00:00.000Z"), priority: "B", name: "Own" }],
      [{ date: d("2026-10-03"), name: "Team" }],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].name).toBe("Own");
  });
});
