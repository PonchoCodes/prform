import { describe, it, expect } from "vitest";
import { attentionLine, buildDigest, type DigestInput } from "@/lib/team/digest";
import { renderDigestEmail } from "@/lib/team/digestEmail";
import { buildTeamTrend } from "@/lib/teamTrend";
import { deriveMeetReadiness } from "@/lib/team/meetReadiness";
import { forecastSession } from "@/lib/sessionForecast";
import { findSleepValueLeaks, findSleepValueLeaksInPayload } from "@/lib/team/coachCopyGuard";

// Monday 2026-09-21, 06:00 in the team's zone.
const TODAY = "2026-09-21";

function trendFixture() {
  const nights = [];
  // Last week (14th–20th): Ada hits every night, Ben logs four and is short twice.
  for (let d = 14; d <= 20; d++) {
    nights.push({ userId: "a", date: `2026-09-${d}`, actualSleepHours: 8.6, targetSleepHours: 8.5, hitTarget: true, needsReview: false });
  }
  for (const d of [14, 15, 17, 19]) {
    const short = d === 15 || d === 19;
    nights.push({ userId: "b", date: `2026-09-${d}`, actualSleepHours: short ? 7 : 8.6, targetSleepHours: 8.5, hitTarget: !short, needsReview: false });
  }
  // The week before: both hit all seven.
  for (let d = 7; d <= 13; d++) {
    const key = `2026-09-${String(d).padStart(2, "0")}`;
    nights.push({ userId: "a", date: key, actualSleepHours: 8.6, targetSleepHours: 8.5, hitTarget: true, needsReview: false });
    nights.push({ userId: "b", date: key, actualSleepHours: 8.6, targetSleepHours: 8.5, hitTarget: true, needsReview: false });
  }
  return buildTeamTrend({
    members: [
      { userId: "a", name: "Ada", joinedOn: "2026-08-01" },
      { userId: "b", name: "Ben", joinedOn: "2026-08-01" },
    ],
    nights,
    hardSessionDates: ["2026-09-15", "2026-09-17"],
    today: TODAY,
  });
}

function input(overrides: Partial<DigestInput> = {}): DigestInput {
  const meet = deriveMeetReadiness({
    meet: { name: "Conference", date: "2026-09-26", distances: "5K" },
    today: TODAY,
    athletes: [
      { name: "Ada", joinedOn: "2026-08-01", nights: [14, 15, 16, 17, 18, 19, 20].map((d) => ({ date: `2026-09-${d}`, actualSleepHours: 8.6, targetSleepHours: 8.5, hitTarget: true })) },
      { name: "Ben", joinedOn: "2026-08-01", nights: [14, 15, 17, 19].map((d) => ({ date: `2026-09-${d}`, actualSleepHours: d === 15 || d === 19 ? 7 : 8.6, targetSleepHours: 8.5, hitTarget: !(d === 15 || d === 19) })) },
      { name: "Cy", joinedOn: "2026-08-01", nights: [] },
    ],
    hardSessionDates: ["2026-09-22"],
  });
  const sessions = [
    { id: "t", date: "2026-09-22", sessionType: "track" },
    { id: "e", date: "2026-09-23", sessionType: "easy" },
    { id: "l", date: "2026-09-25", sessionType: "long_run" },
  ];
  const athletes = [
    { name: "Ada", color: "green" as const, sleepDebtMinutes: 0, nightsLogged: 7 },
    { name: "Ben", color: "amber" as const, sleepDebtMinutes: 90, nightsLogged: 4 },
    { name: "Cy", color: "amber" as const, sleepDebtMinutes: null, nightsLogged: 0 },
  ];
  return {
    teamName: "Riverside XC",
    today: TODAY,
    rosterSize: 3,
    attention: [
      { name: "Ben", color: "amber", trend: "Short on sleep 2 of 4 nights", shortDays: ["Tuesday", "Saturday"], unlogged: 3, nightsLogged: 4 },
      { name: "Cy", color: "amber", trend: "No sleep logged in the last 7 days", shortDays: [], unlogged: 7, nightsLogged: 0 },
    ],
    meet,
    sessions: sessions.map((s) => ({
      date: s.date,
      sessionType: s.sessionType,
      forecast: forecastSession(s, athletes, { today: TODAY, sessions, meetDate: "2026-09-26" }),
    })),
    trend: trendFixture(),
    ...overrides,
  };
}

describe("attentionLine", () => {
  it("names the short nights, the gaps and the next hard session", () => {
    const line = attentionLine(
      { name: "Ben", color: "red", trend: "Short on sleep 3 of 5 nights", shortDays: ["Monday", "Wednesday", "Friday"], unlogged: 2, nightsLogged: 5 },
      "Tuesday",
    );
    expect(line).toBe("Short Monday, Wednesday and Friday, 2 nights unlogged. Make Tuesday aerobic; the pattern costs more than the session returns.");
  });

  it("reads differently for two athletes in the same colour with different weeks", () => {
    const a = attentionLine({ name: "A", color: "amber", trend: "x", shortDays: ["Tuesday", "Thursday"], unlogged: 0, nightsLogged: 7 }, "Wednesday");
    const b = attentionLine({ name: "B", color: "amber", trend: "x", shortDays: ["Sunday"], unlogged: 3, nightsLogged: 4 }, "Wednesday");
    expect(a).not.toBe(b);
    expect(a).toMatch(/Tuesday and Thursday/);
    expect(b).toMatch(/3 nights unlogged/);
  });

  it("asks rather than assumes when nothing was logged", () => {
    expect(attentionLine({ name: "C", color: "amber", trend: "x", shortDays: [], unlogged: 7, nightsLogged: 0 }, null)).toBe(
      "Nothing logged in the last 7 nights. Ask before assuming.",
    );
  });
});

describe("buildDigest", () => {
  it("leads with the attention count in the subject", () => {
    expect(buildDigest(input()).subject).toBe("Riverside XC: 2 need attention");
    expect(buildDigest(input({ attention: [] })).subject).toBe("Riverside XC: everyone on track");
    expect(buildDigest(input({ rosterSize: 0, attention: [] })).subject).toBe("Riverside XC: no athletes yet");
  });

  it("has the four sections in order, and drops the meet when there is none", () => {
    const d = buildDigest(input());
    expect(d.sections.map((s) => s.title)).toEqual(["Needs attention", "Next meet", "This week", "Last week"]);
    const noMeet = buildDigest(input({ meet: null }));
    expect(noMeet.sections.map((s) => s.title)).toEqual(["Needs attention", "This week", "Last week"]);
  });

  it("names each flagged athlete with a line from their own week", () => {
    const [attention] = buildDigest(input()).sections;
    expect(attention.lines[0]).toMatch(/^Ben \(amber\): Short Tuesday and Saturday, 3 nights unlogged\. Run Tuesday as planned only if tonight lands\./);
    expect(attention.lines[1]).toMatch(/^Cy \(amber\): Nothing logged/);
    expect(attention.lines[2]).toBe("1 of 3 on track and not listed.");
  });

  it("gives every session in the coming week its forecast", () => {
    const week = buildDigest(input()).sections.find((s) => s.title === "This week")!;
    expect(week.lines[0]).toMatch(/^Tuesday track\. \d ready, \d marginal, \d not ready\./);
    expect(week.lines[1]).toBe("Wednesday easy.");
    expect(week.lines[2]).toMatch(/^Friday long run\./);
  });

  it("compares last week to the week before as rates", () => {
    const last = buildDigest(input()).sections.find((s) => s.title === "Last week")!;
    expect(last.lines[0]).toBe("Targets hit 82% (100% the week before).");
    expect(last.lines[1]).toBe("Nights logged 79%, 11 of 14 (100% the week before).");
    expect(last.lines[2]).toBe("2 nights short, 0 the week before.");
    expect(last.lines[3]).toBe("2 hard sessions planned.");
  });

  it("never emits a clock time or an hours value anywhere in the digest or the email", () => {
    for (const variant of [input(), input({ meet: null }), input({ attention: [], sessions: [] }), input({ rosterSize: 0, attention: [] })]) {
      const d = buildDigest(variant);
      expect(findSleepValueLeaks(d.subject)).toEqual([]);
      expect(findSleepValueLeaks(d.text), d.text).toEqual([]);
      expect(findSleepValueLeaksInPayload(d)).toEqual([]);
      const email = renderDigestEmail(d, "team_1");
      expect(findSleepValueLeaks(email.text), email.text).toEqual([]);
      // The HTML carries markup and a URL; strip tags and check the words.
      const words = email.html.replace(/<[^>]+>/g, " ").replace(/https?:\S+/g, "");
      expect(findSleepValueLeaks(words), words).toEqual([]);
    }
  });
});
