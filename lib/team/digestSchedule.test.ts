import { describe, it, expect } from "vitest";
import { digestDecision, DIGEST_SEND_HOUR } from "@/lib/team/digestSchedule";

const team = { timezone: "America/New_York", digestEnabled: true, digestLastSentOn: null };

// Monday 2026-09-21 06:20 in New York is 10:20Z.
const mondaySix = new Date("2026-09-21T10:20:00Z");

describe("digestDecision", () => {
  it("is due at the send hour on a local Monday", () => {
    expect(DIGEST_SEND_HOUR).toBe(6);
    expect(digestDecision(team, mondaySix)).toEqual({ due: true, localMonday: "2026-09-21" });
  });

  it("is not due at any other hour", () => {
    expect(digestDecision(team, new Date("2026-09-21T09:59:00Z"))).toEqual({ due: false, reason: "not_send_hour" });
    expect(digestDecision(team, new Date("2026-09-21T11:00:00Z"))).toEqual({ due: false, reason: "not_send_hour" });
  });

  it("is not due on any other day", () => {
    expect(digestDecision(team, new Date("2026-09-22T10:20:00Z"))).toEqual({ due: false, reason: "not_monday" });
  });

  it("reads Monday on the team's clock, not UTC", () => {
    // 06:20 Monday in Auckland is Sunday 18:20Z.
    const auckland = { ...team, timezone: "Pacific/Auckland" };
    expect(digestDecision(auckland, new Date("2026-09-20T18:20:00Z"))).toEqual({ due: true, localMonday: "2026-09-21" });
    expect(digestDecision(team, new Date("2026-09-20T18:20:00Z"))).toEqual({ due: false, reason: "not_monday" });
  });

  it("does not send twice for the same Monday", () => {
    expect(digestDecision({ ...team, digestLastSentOn: "2026-09-21" }, mondaySix)).toEqual({ due: false, reason: "already_sent" });
    expect(digestDecision({ ...team, digestLastSentOn: "2026-09-14" }, mondaySix).due).toBe(true);
  });

  it("respects the team's switch", () => {
    expect(digestDecision({ ...team, digestEnabled: false }, mondaySix)).toEqual({ due: false, reason: "disabled" });
  });
});
