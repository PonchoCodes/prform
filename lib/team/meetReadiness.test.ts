import { describe, it, expect } from "vitest";
import {
  deriveMeetReadiness,
  RAMP_DAYS,
  type AthleteForMeet,
  type NightForMeet,
} from "@/lib/team/meetReadiness";
import { findSleepValueLeaks, findSleepValueLeaksInPayload } from "@/lib/team/coachCopyGuard";
import { addDays } from "@/lib/dateKeys";

// today is a Wednesday; the meet is Saturday week — inside the ramp.
const TODAY = "2026-09-16";
const MEET = "2026-09-26";

function night(date: string, actual: number | null, target = 8.5, hitTarget?: boolean | null): NightForMeet {
  return {
    date,
    actualSleepHours: actual,
    targetSleepHours: target,
    hitTarget: hitTarget ?? (actual == null ? null : actual >= target - 0.25),
  };
}

/** `pattern[i]` is the night i+1 days ago; "H" hit, "S" short, "." unlogged. */
function athlete(name: string, pattern: string, joinedOn = "2026-08-01"): AthleteForMeet {
  const nights: NightForMeet[] = [];
  for (let i = 0; i < pattern.length; i++) {
    const date = addDays(TODAY, -(i + 1));
    if (pattern[i] === "H") nights.push(night(date, 8.6));
    if (pattern[i] === "S") nights.push(night(date, 7.0));
    // "L": slept enough but the plan judged the night missed (late bedtime).
    if (pattern[i] === "L") nights.push(night(date, 8.5, 8.5, false));
  }
  return { name, joinedOn, nights };
}

function run(athletes: AthleteForMeet[], overrides: Partial<Parameters<typeof deriveMeetReadiness>[0]> = {}) {
  return deriveMeetReadiness({
    meet: { name: "Conference", date: MEET, distances: "5K" },
    today: TODAY,
    athletes,
    hardSessionDates: ["2026-09-18", "2026-09-22"],
    ...overrides,
  });
}

describe("deriveMeetReadiness", () => {
  it("reports days out and that the ten-night ramp is open", () => {
    const r = run([]);
    expect(r.daysOut).toBe(10);
    expect(RAMP_DAYS).toBe(10);
    expect(r.rampOpen).toBe(true);
    expect(r.rampOpensIn).toBe(0);
  });

  it("puts an athlete who hit every ramp night on the ramp and green", () => {
    const r = run([athlete("Maya", "HHHHHHH")]);
    expect(r.athletes[0]).toMatchObject({ name: "Maya", readiness: "green", ramp: "on_ramp" });
    expect(r.summary).toBe("1 of 1 on the ramp");
  });

  it("marks two short nights as behind and names the weekdays", () => {
    // Yesterday (Tue) and 3 days ago (Sun) short.
    const r = run([athlete("Jonah", "SHSHHHH")]);
    const row = r.athletes[0];
    expect(row.readiness).toBe("amber");
    expect(row.ramp).toBe("behind");
    expect(row.line).toMatch(/short Sunday and Tuesday/);
    expect(row.line).toMatch(/10 nights to Saturday/);
  });

  it("tells a red athlete to make the next hard session aerobic, by weekday", () => {
    const r = run([athlete("Cassie", "SSSSSHH")]);
    const row = r.athletes[0];
    expect(row.readiness).toBe("red");
    expect(row.ramp).toBe("behind");
    // Next hard session is Friday the 18th.
    expect(row.line).toMatch(/Make Friday aerobic/);
  });

  it("distinguishes enough sleep at the wrong time from not enough sleep", () => {
    const r = run([athlete("Theo", "LLLHHHH")]);
    const row = r.athletes[0];
    expect(row.readiness).toBe("green");
    expect(row.ramp).toBe("behind");
    expect(row.line).toMatch(/late against the ramp on 3 of 7 nights/);
  });

  it("groups athletes with nothing in the window separately, at the bottom", () => {
    const r = run([athlete("Silent", "......."), athlete("Maya", "HHHHHHH")]);
    expect(r.athletes.map((a) => a.name)).toEqual(["Maya"]);
    expect(r.noData.map((a) => a.name)).toEqual(["Silent"]);
    expect(r.noData[0].ramp).toBe("no_data");
    expect(r.noData[0].line).toMatch(/Nothing logged/);
  });

  it("sorts worst first: red before amber before green, behind before on ramp", () => {
    const r = run([
      athlete("Green", "HHHHHHH"),
      athlete("Amber", "SHSHHHH"),
      athlete("Red", "SSSSHHH"),
      athlete("LateGreen", "LLLHHHH"),
    ]);
    expect(r.athletes.map((a) => a.name)).toEqual(["Red", "Amber", "LateGreen", "Green"]);
  });

  it("does not count nights before the athlete joined", () => {
    // Joined 2 days ago; only two nights can exist in the window.
    const r = run([athlete("New", "HH", addDays(TODAY, -2))]);
    expect(r.athletes[0].ramp).toBe("on_ramp");
    expect(r.athletes[0].line).not.toMatch(/unlogged/);
  });

  it("counts unlogged nights inside the window and says so", () => {
    const r = run([athlete("Gappy", "H..H.HH")]);
    expect(r.athletes[0].line).toMatch(/3 nights unlogged/);
  });

  it("reads the trailing week when the ramp has not opened and says when it does", () => {
    const r = run([athlete("Maya", "HHHHHHH")], { meet: { name: "Champs", date: "2026-10-16", distances: "5K" } });
    expect(r.rampOpen).toBe(false);
    expect(r.rampOpensIn).toBe(20);
    expect(r.athletes[0].line).toMatch(/^Ramp opens in 20 days\./);
    expect(r.summary).toMatch(/^Ramp opens in 20 days/);
  });

  it("gives two athletes in the same bucket different lines when their nights differ", () => {
    const r = run([athlete("A", "SHSHHHH"), athlete("B", "HSHHSHH")]);
    const [a, b] = r.athletes;
    expect(a.readiness).toBe(b.readiness);
    expect(a.ramp).toBe(b.ramp);
    expect(a.line).not.toBe(b.line);
  });

  it("never emits a clock time or an hours value, on any row or in the payload", () => {
    const r = run([
      athlete("Green", "HHHHHHH"),
      athlete("Amber", "SHSHHHH"),
      athlete("Red", "SSSSHHH"),
      athlete("LateGreen", "LLLHHHH"),
      athlete("Gappy", "H..H.HH"),
      athlete("Silent", "......."),
      athlete("New", "H", addDays(TODAY, -1)),
    ]);
    for (const row of [...r.athletes, ...r.noData]) {
      expect(findSleepValueLeaks(row.line), row.line).toEqual([]);
    }
    expect(findSleepValueLeaks(r.summary)).toEqual([]);
    expect(findSleepValueLeaksInPayload(r)).toEqual([]);
  });
});
