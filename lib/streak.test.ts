import { describe, it, expect } from "vitest";
import { computeCheckInStreak, streakSentence, type DateKey } from "@/lib/streak";

// Anchor: 2026-08-03 is a Monday.
//   Mon 08-03  Tue 08-04  Wed 08-05  Thu 08-06  Fri 08-07  Sat 08-08  Sun 08-09
// "today" in these tests is 2026-08-10 unless stated, so the last countable
// night is Sunday 2026-08-09.

const TODAY: DateKey = "2026-08-10";

function days(...dates: DateKey[]): DateKey[] {
  return dates;
}

/** Every date from `from` to `to` inclusive. */
function range(from: DateKey, to: DateKey): DateKey[] {
  const out: DateKey[] = [];
  const cursor = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  while (cursor <= end) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

describe("computeCheckInStreak — counting", () => {
  it("is zero with no history at all", () => {
    expect(computeCheckInStreak({ loggedDates: [], today: TODAY })).toMatchObject({
      current: 0,
      longest: 0,
    });
  });

  it("counts an unbroken run up to last night", () => {
    const streak = computeCheckInStreak({
      loggedDates: range("2026-08-03", "2026-08-09"),
      today: TODAY,
    });
    expect(streak.current).toBe(7);
    expect(streak.atRisk).toBe(false);
    expect(streak.forgivenInCurrent).toBe(0);
  });

  it("does not count tonight, which has not happened yet", () => {
    // A night is filed under the date it begins. Counting today would show
    // every athlete one day short of their real streak, every single day.
    const streak = computeCheckInStreak({
      loggedDates: range("2026-08-03", "2026-08-10"),
      today: TODAY,
    });
    expect(streak.current).toBe(7);
  });
});

describe("computeCheckInStreak — a missed target never breaks it", () => {
  it("counts a night that was logged, whatever the night was like", () => {
    // The rule the whole feature turns on. These dates carry no information
    // about duration or targets — by construction, the streak cannot see them.
    const streak = computeCheckInStreak({
      loggedDates: range("2026-08-03", "2026-08-09"),
      today: TODAY,
    });
    // Seven consecutive catastrophic nights, honestly reported, is a seven-day
    // streak. That is the intended behaviour, not a loophole.
    expect(streak.current).toBe(7);
  });
});

describe("computeCheckInStreak — one skipped night per week", () => {
  it("bridges a single miss", () => {
    // Missed Wednesday 08-05, logged everything else.
    const streak = computeCheckInStreak({
      loggedDates: days("2026-08-03", "2026-08-04", "2026-08-06", "2026-08-07", "2026-08-08", "2026-08-09"),
      today: TODAY,
    });
    expect(streak.current).toBe(6);
    expect(streak.forgivenInCurrent).toBe(1);
  });

  it("does not credit a forgiven night as a day checked in", () => {
    // Six logged nights bridged over one miss is six, not seven. Forgiveness
    // buys continuity, not credit for a night nobody reported.
    const streak = computeCheckInStreak({
      loggedDates: days("2026-08-03", "2026-08-04", "2026-08-06", "2026-08-07", "2026-08-08", "2026-08-09"),
      today: TODAY,
    });
    expect(streak.current).toBe(6);
  });

  it("breaks on two misses in a row", () => {
    // Missed Thursday and Friday. The second cannot be forgiven within seven
    // days of the first, which matches what people already expect a streak to
    // do and is the plain reading of "one night a week".
    const streak = computeCheckInStreak({
      loggedDates: days("2026-08-03", "2026-08-04", "2026-08-05", "2026-08-08", "2026-08-09"),
      today: TODAY,
    });
    expect(streak.current).toBe(2); // Sat + Sun
  });

  it("breaks on two misses inside the same week, even when spread apart", () => {
    // Missed Tuesday and Saturday: five days apart, still inside seven.
    const streak = computeCheckInStreak({
      loggedDates: days("2026-08-03", "2026-08-05", "2026-08-06", "2026-08-07", "2026-08-09"),
      today: TODAY,
    });
    // Sun 08-09 counts, Sat 08-08 is bridged, Fri/Thu/Wed count, Tue 08-04 is
    // the second miss inside seven days and stops the walk.
    expect(streak.current).toBe(4);
    expect(streak.forgivenInCurrent).toBe(1);
  });

  it("bridges a second miss once a full week has passed", () => {
    // Missed 08-01 and 08-09 — eight days apart, so both are forgiven.
    const logged = range("2026-07-25", "2026-08-08").filter((d) => d !== "2026-08-01");
    const streak = computeCheckInStreak({
      loggedDates: logged,
      today: "2026-08-10",
    });
    expect(streak.forgivenInCurrent).toBe(1);
    expect(streak.current).toBe(14);
  });

  it("does not let a calendar boundary hand out a second skip", () => {
    // Sunday 08-09 and Monday 08-10 are different ISO weeks. Under a
    // calendar-week allowance both would be forgiven — two nights in two days
    // out of a promise that says one a week.
    const logged = range("2026-08-01", "2026-08-11").filter(
      (d) => d !== "2026-08-09" && d !== "2026-08-10",
    );
    const streak = computeCheckInStreak({ loggedDates: logged, today: "2026-08-12" });
    expect(streak.current).toBe(1); // 08-11 only
  });
});

describe("computeCheckInStreak — last night is still open", () => {
  it("flags at risk rather than broken when last night is unlogged", () => {
    // 06:40, on the way to practice, about to log last night. A streak that
    // had already broken at midnight would be wrong for the seven hours the
    // athlete was asleep and could do nothing about it.
    const streak = computeCheckInStreak({
      loggedDates: range("2026-08-03", "2026-08-08"),
      today: TODAY, // 08-09 not logged
    });
    expect(streak.atRisk).toBe(true);
    expect(streak.current).toBe(6);
  });

  it("costs neither a day nor a forgiveness while it is still open", () => {
    const stillOpen = computeCheckInStreak({
      loggedDates: range("2026-08-03", "2026-08-08"),
      today: TODAY,
    });
    expect(stillOpen.forgivenInCurrent).toBe(0);

    // The next day, the same unlogged night is genuinely missed and is bridged.
    const nextDay = computeCheckInStreak({
      loggedDates: [...range("2026-08-03", "2026-08-08"), "2026-08-10"],
      today: "2026-08-11",
    });
    expect(nextDay.atRisk).toBe(false);
    expect(nextDay.forgivenInCurrent).toBe(1);
    expect(nextDay.current).toBe(7);
  });
});

describe("computeCheckInStreak — canSkipTonight", () => {
  it("is true when no forgiveness has been used recently", () => {
    const streak = computeCheckInStreak({
      loggedDates: range("2026-08-03", "2026-08-09"),
      today: TODAY,
    });
    expect(streak.canSkipTonight).toBe(true);
  });

  it("is false in the week after a skip was used", () => {
    const streak = computeCheckInStreak({
      loggedDates: days("2026-08-03", "2026-08-04", "2026-08-06", "2026-08-07", "2026-08-08", "2026-08-09"),
      today: TODAY,
    });
    // The Wednesday miss was bridged five days ago; another one tonight would
    // not be. Telling the athlete the truth about their margin beats letting
    // them guess.
    expect(streak.canSkipTonight).toBe(false);
  });
});

describe("computeCheckInStreak — longest", () => {
  it("remembers a better run from the past", () => {
    const old = range("2026-06-01", "2026-06-20"); // 20 days
    const recent = range("2026-08-08", "2026-08-09"); // 2 days
    const streak = computeCheckInStreak({ loggedDates: [...old, ...recent], today: TODAY });

    expect(streak.current).toBe(2);
    expect(streak.longest).toBe(20);
  });

  it("is never less than the current run", () => {
    const streak = computeCheckInStreak({
      loggedDates: range("2026-08-03", "2026-08-09"),
      today: TODAY,
    });
    expect(streak.longest).toBeGreaterThanOrEqual(streak.current);
  });

  it("applies the same forgiveness to history", () => {
    // One miss inside an otherwise unbroken fortnight.
    const logged = range("2026-06-01", "2026-06-14").filter((d) => d !== "2026-06-07");
    const streak = computeCheckInStreak({ loggedDates: logged, today: TODAY });
    expect(streak.longest).toBe(13);
  });
});

describe("holds — days the athlete marked as away", () => {
  it("removes held days from the question entirely", () => {
    // Logged Mon and Tue, away Wed to Fri, logged Sat and Sun. Four logged
    // days, one unbroken run.
    const streak = computeCheckInStreak({
      loggedDates: days("2026-08-03", "2026-08-04", "2026-08-08", "2026-08-09"),
      today: TODAY,
      holds: [{ startsOn: "2026-08-05", endsOn: "2026-08-07" }],
    });
    expect(streak.current).toBe(4);
    expect(streak.heldInCurrent).toBe(3);
  });

  it("does not credit a held day as a day checked in", () => {
    const streak = computeCheckInStreak({
      loggedDates: days("2026-08-03", "2026-08-09"),
      today: TODAY,
      holds: [{ startsOn: "2026-08-04", endsOn: "2026-08-08" }],
    });
    expect(streak.current).toBe(2);
  });

  it("saves a long streak across a fortnight away", () => {
    // Forty days logged, then a fortnight in hospital, then back to it. The
    // case the hold exists for: without it this is a streak of 1.
    const before = range("2026-06-01", "2026-07-10"); // 40 days
    const after = range("2026-07-25", "2026-08-09");
    const streak = computeCheckInStreak({
      loggedDates: [...before, ...after],
      today: TODAY,
      holds: [{ startsOn: "2026-07-11", endsOn: "2026-07-24" }],
    });
    expect(streak.current).toBe(before.length + after.length);
    expect(streak.heldInCurrent).toBe(14);
  });

  it("does not spend the weekly skip", () => {
    // Away Wednesday, and separately missed Friday. The Friday miss must still
    // find the forgiveness unused: a declared absence quietly consuming the one
    // skip someone was saving is the bug this pins.
    const streak = computeCheckInStreak({
      loggedDates: days("2026-08-03", "2026-08-04", "2026-08-06", "2026-08-08", "2026-08-09"),
      today: TODAY,
      holds: [{ startsOn: "2026-08-05", endsOn: "2026-08-05" }],
    });
    expect(streak.current).toBe(5);
    expect(streak.forgivenInCurrent).toBe(1);
    expect(streak.heldInCurrent).toBe(1);
  });

  it("is not at risk when last night was held", () => {
    // Telling someone on a hospital ward to log last night to keep their streak
    // would be the app at its worst.
    const streak = computeCheckInStreak({
      loggedDates: range("2026-08-03", "2026-08-07"),
      today: TODAY,
      holds: [{ startsOn: "2026-08-08", endsOn: "2026-08-12" }],
    });
    expect(streak.atRisk).toBe(false);
    expect(streak.onHoldToday).toBe(true);
    expect(streak.current).toBe(5);
  });

  it("cannot be farmed, which is why it needs no limit", () => {
    // Every day held and nothing ever logged is a streak of zero. A held day is
    // not a checked-in day either.
    const streak = computeCheckInStreak({
      loggedDates: [],
      today: TODAY,
      holds: [{ startsOn: "2026-01-01", endsOn: "2026-12-31" }],
    });
    expect(streak.current).toBe(0);
  });

  it("applies to the longest run in history too", () => {
    const before = range("2026-06-01", "2026-06-10");
    const after = range("2026-06-16", "2026-06-20");
    const streak = computeCheckInStreak({
      loggedDates: [...before, ...after],
      today: TODAY,
      holds: [{ startsOn: "2026-06-11", endsOn: "2026-06-15" }],
    });
    expect(streak.longest).toBe(15);
  });

  it("behaves identically when no holds are passed at all", () => {
    const dates = range("2026-08-03", "2026-08-09");
    expect(computeCheckInStreak({ loggedDates: dates, today: TODAY })).toEqual(
      computeCheckInStreak({ loggedDates: dates, today: TODAY, holds: [] }),
    );
  });
});

describe("streakSentence", () => {
  function at(current: number) {
    return streakSentence({
      current,
      longest: current,
      forgivenInCurrent: 0,
      atRisk: false,
      canSkipTonight: true,
      heldInCurrent: 0,
      onHoldToday: false,
    });
  }

  it("says nothing for the first two days", () => {
    // Announcing a one-day streak tells someone they have nothing to protect.
    expect(at(0)).toBeNull();
    expect(at(1)).toBeNull();
    expect(at(2)).toBeNull();
  });

  it("speaks from day three, with the number in it", () => {
    expect(at(3)).toBe("Day 3 of checking in.");
    expect(at(21)).toBe("Day 21 of checking in.");
  });

  it("matches the messaging house style", () => {
    const sentence = at(12)!;
    expect(sentence).not.toMatch(/[!🎉🔥]/); // no exclamation, no emoji
    expect(sentence).toMatch(/\d/); // a number wherever there is one to give
    expect(sentence.length).toBeLessThan(40); // it shares 320 chars with a verdict
  });
});
