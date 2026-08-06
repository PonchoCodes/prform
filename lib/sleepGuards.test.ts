import { describe, it, expect } from "vitest";
import {
  guardRecalledDuration,
  isPlausibleDuration,
  isSplitNight,
  resolveNight,
  MAX_SLEEP_MINUTES,
  MIN_SLEEP_MINUTES,
  type NightSignals,
} from "@/lib/sleepGuards";

const at = (iso: string) => new Date(iso);

/** Went down at 21:30 on the 5th. Every case below starts here. */
const ONSET = at("2026-08-05T21:30:00Z");

function signals(overrides: Partial<NightSignals> = {}): NightSignals {
  return { sleepOnsetAt: ONSET, wakeAt: null, declaredWakeAt: null, ...overrides };
}

describe("a night that can be scored", () => {
  it("measures onset to wake", () => {
    const result = resolveNight(
      signals({ wakeAt: at("2026-08-06T05:30:00Z") }),
      at("2026-08-06T06:00:00Z"),
    );
    expect(result).toEqual({ kind: "duration", minutes: 480, source: "TIMESTAMPED" });
  });

  it("prefers a real wake signal over the declared one", () => {
    // Declared 06:00, actually up at 05:30. The observed time wins — that is
    // the entire reason for asking.
    const result = resolveNight(
      signals({
        wakeAt: at("2026-08-06T05:30:00Z"),
        declaredWakeAt: at("2026-08-06T06:00:00Z"),
      }),
      at("2026-08-06T09:00:00Z"),
    );
    expect(result).toEqual({ kind: "duration", minutes: 480, source: "TIMESTAMPED" });
  });

  it("accepts both edges of the plausible window", () => {
    const twoHours = resolveNight(
      signals({ wakeAt: new Date(ONSET.getTime() + MIN_SLEEP_MINUTES * 60000) }),
      at("2026-08-06T12:00:00Z"),
    );
    expect(twoHours).toEqual({ kind: "duration", minutes: 120, source: "TIMESTAMPED" });

    const fourteenHours = resolveNight(
      signals({ wakeAt: new Date(ONSET.getTime() + MAX_SLEEP_MINUTES * 60000) }),
      at("2026-08-06T18:00:00Z"),
    );
    expect(fourteenHours).toEqual({ kind: "duration", minutes: 840, source: "TIMESTAMPED" });
  });
});

describe("a night that cannot be scored", () => {
  it("refuses the 27-hour night a missing reply would otherwise create", () => {
    // Went down Wednesday 21:30, never texted UP, finally texts it Friday.
    // This is the number that would silently drag a fortnight of the trend
    // line upward if it were stored.
    const result = resolveNight(
      signals({ wakeAt: at("2026-08-07T00:30:00Z") }),
      at("2026-08-07T01:00:00Z"),
    );
    expect(result).toEqual({
      kind: "review",
      reason: "implausible_duration",
      note: expect.stringContaining("27h"),
    });
    // The important half of the assertion: no duration comes back at all.
    expect(result).not.toHaveProperty("minutes");
  });

  it("refuses a nap", () => {
    const result = resolveNight(
      signals({ wakeAt: at("2026-08-05T22:45:00Z") }),
      at("2026-08-06T06:00:00Z"),
    );
    expect(result.kind).toBe("review");
    expect(result).not.toHaveProperty("minutes");
  });

  it("refuses a wake that is not after the onset", () => {
    for (const wake of ["2026-08-05T21:30:00Z", "2026-08-05T20:00:00Z"]) {
      const result = resolveNight(signals({ wakeAt: at(wake) }), at("2026-08-06T09:00:00Z"));
      expect(result, wake).toMatchObject({ kind: "review", reason: "wake_before_onset" });
    }
  });

  it("rejects one minute past the ceiling and accepts one minute inside it", () => {
    const inside = resolveNight(
      signals({ wakeAt: new Date(ONSET.getTime() + (MAX_SLEEP_MINUTES - 1) * 60000) }),
      at("2026-08-07T00:00:00Z"),
    );
    expect(inside.kind).toBe("duration");

    const outside = resolveNight(
      signals({ wakeAt: new Date(ONSET.getTime() + (MAX_SLEEP_MINUTES + 1) * 60000) }),
      at("2026-08-07T00:00:00Z"),
    );
    expect(outside.kind).toBe("review");
  });
});

describe("closing a night nobody closed", () => {
  const declared = at("2026-08-06T05:30:00Z");

  it("waits until two hours past the declared wake", () => {
    // One minute before the deadline, the athlete might still be about to text.
    const early = resolveNight(
      signals({ declaredWakeAt: declared }),
      at("2026-08-06T07:29:00Z"),
    );
    expect(early).toEqual({ kind: "wait" });
  });

  it("closes at the declared wake once the grace period passes", () => {
    const result = resolveNight(
      signals({ declaredWakeAt: declared }),
      at("2026-08-06T07:30:00Z"),
    );
    expect(result).toEqual({ kind: "duration", minutes: 480, source: "INFERRED" });
  });

  it("still refuses to close at an implausible declared wake", () => {
    // A wake declared for the following evening. Past the grace period, and
    // still not a night.
    const result = resolveNight(
      signals({ declaredWakeAt: at("2026-08-07T02:00:00Z") }),
      at("2026-08-08T00:00:00Z"),
    );
    expect(result).toMatchObject({ kind: "review", reason: "implausible_duration" });
    expect(result).not.toHaveProperty("minutes");
  });

  it("leaves a night open when there is nothing to close it at", () => {
    expect(resolveNight(signals(), at("2026-08-09T00:00:00Z"))).toEqual({ kind: "wait" });
  });

  it("does nothing at all without an onset", () => {
    // No BED ever arrived. There is no start time, so there is no night — and
    // inventing one from the declared wake alone would be fabrication.
    const result = resolveNight(
      { sleepOnsetAt: null, wakeAt: at("2026-08-06T05:30:00Z"), declaredWakeAt: declared },
      at("2026-08-06T09:00:00Z"),
    );
    expect(result).toEqual({ kind: "wait" });
  });
});

describe("split nights", () => {
  it("recognises a second BED with no UP between", () => {
    expect(isSplitNight({ sleepOnsetAt: ONSET, wakeAt: null, declaredWakeAt: null })).toBe(true);
  });

  it("does not mistake a normal second night for one", () => {
    // Onset and wake both present: the previous night is closed, so a new BED
    // is a new night rather than a continuation.
    expect(
      isSplitNight({
        sleepOnsetAt: ONSET,
        wakeAt: at("2026-08-06T05:30:00Z"),
        declaredWakeAt: null,
      }),
    ).toBe(false);
    expect(isSplitNight({ sleepOnsetAt: null, wakeAt: null, declaredWakeAt: null })).toBe(false);
  });
});

describe("durations the athlete reports", () => {
  it("accepts a real night", () => {
    expect(guardRecalledDuration(420)).toEqual({
      kind: "duration",
      minutes: 420,
      source: "TIMESTAMPED",
    });
  });

  it("refuses one that parsed cleanly but is not a night", () => {
    // "about 18 hours" is a perfectly good parse and a perfectly bad night.
    const result = guardRecalledDuration(1080);
    expect(result).toMatchObject({ kind: "review", reason: "implausible_duration" });
    expect(result).not.toHaveProperty("minutes");
    expect(guardRecalledDuration(30).kind).toBe("review");
  });
});

describe("the window itself", () => {
  it("is 2 to 14 hours inclusive", () => {
    expect(isPlausibleDuration(119)).toBe(false);
    expect(isPlausibleDuration(120)).toBe(true);
    expect(isPlausibleDuration(840)).toBe(true);
    expect(isPlausibleDuration(841)).toBe(false);
    expect(isPlausibleDuration(0)).toBe(false);
    expect(isPlausibleDuration(-60)).toBe(false);
    // 24h and 27h are the two that matter, because both look like real numbers.
    expect(isPlausibleDuration(24 * 60)).toBe(false);
    expect(isPlausibleDuration(27 * 60)).toBe(false);
  });
});
