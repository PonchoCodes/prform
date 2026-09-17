import { describe, it, expect } from "vitest";
import { canNudgeAgain, nudgeChannelFor, nudgeWindowStart, nudgeZoneFor } from "@/lib/team/nudge";
import { coachNudge, coachNudgePreview } from "@/lib/messaging/copy";
import { findSleepValueLeaks } from "@/lib/team/coachCopyGuard";

const verified = {
  phoneNumber: "+15551234567",
  phoneVerifiedAt: new Date("2026-08-01T00:00:00Z"),
  smsStatus: "ACTIVE" as const,
  ianaTimezone: "America/New_York",
};

describe("nudgeChannelFor", () => {
  it("texts a verified, active number", () => {
    expect(nudgeChannelFor(verified)).toBe("SMS");
  });

  it("falls back to email for anyone the evening question would not text", () => {
    expect(nudgeChannelFor({ ...verified, phoneVerifiedAt: null })).toBe("EMAIL");
    expect(nudgeChannelFor({ ...verified, smsStatus: "STOPPED" })).toBe("EMAIL");
    expect(nudgeChannelFor({ ...verified, smsStatus: "UNVERIFIED" })).toBe("EMAIL");
    expect(nudgeChannelFor({ ...verified, phoneNumber: null })).toBe("EMAIL");
    expect(nudgeChannelFor({ ...verified, ianaTimezone: null })).toBe("EMAIL");
  });
});

describe("canNudgeAgain — one per athlete per team per athlete-local day", () => {
  // 2026-09-16 23:30 in New York is 03:30Z on the 17th.
  const lateEvening = new Date("2026-09-17T03:30:00Z");
  const tz = "America/New_York";

  it("allows the first nudge", () => {
    expect(canNudgeAgain(null, lateEvening, tz)).toBe(true);
  });

  it("refuses a second nudge on the same local day", () => {
    const earlier = new Date("2026-09-16T12:00:00Z"); // 08:00 local, same day
    expect(canNudgeAgain(earlier, lateEvening, tz)).toBe(false);
  });

  it("allows one after local midnight even when the UTC date has not changed", () => {
    // 00:10 local on the 17th is 04:10Z on the 17th; the last nudge was 23:30 local on the 16th.
    const justAfterMidnight = new Date("2026-09-17T04:10:00Z");
    expect(canNudgeAgain(lateEvening, justAfterMidnight, tz)).toBe(true);
  });

  it("draws the line on the athlete's clock, not UTC", () => {
    // Same two instants read as the same UTC day but different New York days.
    expect(canNudgeAgain(new Date("2026-09-17T03:30:00Z"), new Date("2026-09-17T04:10:00Z"), "UTC")).toBe(false);
    expect(canNudgeAgain(new Date("2026-09-17T03:30:00Z"), new Date("2026-09-17T04:10:00Z"), tz)).toBe(true);
  });

  it("computes the window start as local midnight", () => {
    expect(nudgeWindowStart(lateEvening, tz).toISOString()).toBe("2026-09-16T04:00:00.000Z");
  });

  it("falls back to UTC when the athlete has no zone on file", () => {
    expect(nudgeZoneFor({ ianaTimezone: null })).toBe("UTC");
    expect(nudgeZoneFor({ ianaTimezone: "Europe/Paris" })).toBe("Europe/Paris");
  });
});

describe("nudge copy", () => {
  it("the athlete's body names the coach and carries their own target", () => {
    const body = coachNudge({ coachName: "Coach Bell", teamName: "Summit TC", targetHours: 8.5 });
    expect(body).toBe("Coach Bell from Summit TC checked in. Tonight's target is 8.5h. Log it in the morning.");
  });

  it("says to check the app when no target could be computed", () => {
    const body = coachNudge({ coachName: "Coach Bell", teamName: "Summit TC", targetHours: null });
    expect(body).toMatch(/Tonight's target is in the app\./);
  });

  it("the coach's preview is fixed and carries no hours value or clock time", () => {
    const preview = coachNudgePreview();
    expect(findSleepValueLeaks(preview)).toEqual([]);
    // The body legitimately carries the target; the preview must not.
    expect(preview).not.toMatch(/\dh/);
  });
});
