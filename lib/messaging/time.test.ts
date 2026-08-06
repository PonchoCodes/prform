import { describe, it, expect } from "vitest";
import {
  addLocalDays,
  clockToMinutes,
  instantFromLocal,
  isValidTimeZone,
  localClockOf,
  localDateOf,
  minutesToClock,
  offsetMinutesAt,
} from "@/lib/messaging/time";

const NY = "America/New_York";
const KOLKATA = "Asia/Kolkata";
const AUCKLAND = "Pacific/Auckland";

describe("isValidTimeZone", () => {
  it("accepts IANA identifiers", () => {
    for (const tz of [NY, KOLKATA, AUCKLAND, "UTC", "Europe/London", "America/Sao_Paulo"]) {
      expect(isValidTimeZone(tz), tz).toBe(true);
    }
  });

  it("rejects offsets, which are the thing this module exists to avoid", () => {
    for (const bad of ["-05:00", "+5", "UTC-5", "GMT+2", "", "Mars/Olympus", null, 5]) {
      expect(isValidTimeZone(bad), JSON.stringify(bad)).toBe(false);
    }
  });
});

describe("reading a local date and time from an instant", () => {
  it("gives the athlete's date, not the server's", () => {
    // 03:30 UTC on the 6th is still the evening of the 5th in New York. A cron
    // that reasoned in UTC would file this under the wrong night.
    const instant = new Date("2026-08-06T03:30:00Z");
    expect(localDateOf(instant, NY)).toBe("2026-08-05");
    expect(localClockOf(instant, NY)).toBe("23:30");
    expect(localDateOf(instant, "UTC")).toBe("2026-08-06");
  });

  it("handles a zone that is a day ahead", () => {
    const instant = new Date("2026-08-05T13:00:00Z");
    expect(localDateOf(instant, AUCKLAND)).toBe("2026-08-06");
    expect(localClockOf(instant, AUCKLAND)).toBe("01:00");
  });

  it("handles half-hour offsets", () => {
    const instant = new Date("2026-08-05T12:00:00Z");
    expect(localClockOf(instant, KOLKATA)).toBe("17:30");
    expect(offsetMinutesAt(instant, KOLKATA)).toBe(330);
  });

  it("reports a different offset for the same zone in winter and summer", () => {
    // The single fact that makes a stored offset wrong half the year.
    expect(offsetMinutesAt(new Date("2026-01-15T12:00:00Z"), NY)).toBe(-300);
    expect(offsetMinutesAt(new Date("2026-07-15T12:00:00Z"), NY)).toBe(-240);
  });
});

describe("instantFromLocal", () => {
  it("round-trips ordinary wall times in both DST states", () => {
    for (const [date, clock] of [
      ["2026-01-15", "06:30"],
      ["2026-07-15", "06:30"],
      ["2026-08-05", "20:15"],
      ["2026-12-31", "23:59"],
      ["2026-02-28", "00:00"],
    ] as const) {
      const { instant, exact } = instantFromLocal(date, clock, NY);
      expect(exact, `${date} ${clock}`).toBe(true);
      expect(localDateOf(instant, NY)).toBe(date);
      expect(localClockOf(instant, NY)).toBe(clock);
    }
  });

  it("round-trips across several zones", () => {
    for (const tz of [NY, KOLKATA, AUCKLAND, "UTC", "Europe/London"]) {
      const { instant } = instantFromLocal("2026-08-05", "05:30", tz);
      expect(localClockOf(instant, tz), tz).toBe("05:30");
      expect(localDateOf(instant, tz), tz).toBe("2026-08-05");
    }
  });

  it("places a wall time correctly on each side of the spring transition", () => {
    // US DST 2026 begins 08 March. 01:30 exists (EST), 03:30 exists (EDT).
    const before = instantFromLocal("2026-03-08", "01:30", NY);
    expect(before.exact).toBe(true);
    expect(before.instant.toISOString()).toBe("2026-03-08T06:30:00.000Z");

    const after = instantFromLocal("2026-03-08", "03:30", NY);
    expect(after.exact).toBe(true);
    expect(after.instant.toISOString()).toBe("2026-03-08T07:30:00.000Z");
  });

  it("flags a wall time that the spring transition skips", () => {
    // 02:30 never happens on 08 March 2026 in New York.
    const gap = instantFromLocal("2026-03-08", "02:30", NY);
    expect(gap.exact).toBe(false);
    // Still a usable instant, and it is at or after the time asked for rather
    // than an hour before it.
    expect(gap.instant.toISOString()).toBe("2026-03-08T07:30:00.000Z");
    expect(localClockOf(gap.instant, NY)).toBe("03:30");
  });

  it("resolves an ambiguous autumn wall time to the earlier occurrence", () => {
    // US DST 2026 ends 01 November; 01:30 happens twice, at 05:30Z and 06:30Z.
    const overlap = instantFromLocal("2026-11-01", "01:30", NY);
    expect(overlap.exact).toBe(true);
    expect(overlap.instant.toISOString()).toBe("2026-11-01T05:30:00.000Z");
    expect(localClockOf(overlap.instant, NY)).toBe("01:30");
  });

  it("handles the southern-hemisphere transition too", () => {
    // Auckland DST ends 05 April 2026; the northern-hemisphere assumption that
    // "spring is March" would get this backwards.
    const { instant, exact } = instantFromLocal("2026-04-06", "06:00", AUCKLAND);
    expect(exact).toBe(true);
    expect(localClockOf(instant, AUCKLAND)).toBe("06:00");
    expect(localDateOf(instant, AUCKLAND)).toBe("2026-04-06");
  });

  it("never returns an invalid date", () => {
    for (const tz of [NY, KOLKATA, AUCKLAND, "UTC"]) {
      for (const clock of ["00:00", "02:30", "03:00", "12:00", "23:59"]) {
        const { instant } = instantFromLocal("2026-03-08", clock, tz);
        expect(Number.isFinite(instant.getTime()), `${tz} ${clock}`).toBe(true);
      }
    }
  });
});

describe("local date arithmetic", () => {
  it("adds days without touching an instant", () => {
    expect(addLocalDays("2026-08-05", 1)).toBe("2026-08-06");
    expect(addLocalDays("2026-08-31", 1)).toBe("2026-09-01");
    expect(addLocalDays("2026-01-01", -1)).toBe("2025-12-31");
    // Crossing a DST boundary must not shift the calendar date.
    expect(addLocalDays("2026-03-07", 1)).toBe("2026-03-08");
    expect(addLocalDays("2026-11-01", 1)).toBe("2026-11-02");
  });
});

describe("clock helpers", () => {
  it("parses what it should and refuses what it shouldn't", () => {
    expect(clockToMinutes("05:30")).toBe(330);
    expect(clockToMinutes("5:30")).toBe(330);
    expect(clockToMinutes("00:00")).toBe(0);
    expect(clockToMinutes("23:59")).toBe(1439);
    for (const bad of ["24:00", "05:60", "abc", "5", "", null, undefined, 530]) {
      expect(clockToMinutes(bad), JSON.stringify(bad)).toBeNull();
    }
  });

  it("wraps minutes back onto a clock face", () => {
    expect(minutesToClock(0)).toBe("00:00");
    expect(minutesToClock(1305)).toBe("21:45");
    expect(minutesToClock(-135)).toBe("21:45");
    expect(minutesToClock(1440)).toBe("00:00");
  });
});
