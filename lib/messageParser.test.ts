import { describe, it, expect } from "vitest";
import { parseMessage, type ParsedMessage, type ParseContext } from "@/lib/messageParser";

/**
 * The table. Every row is something a 16-year-old might plausibly send at
 * 21:00, and the expected reading of it.
 */
type Row = [input: string, expected: ParsedMessage, context?: ParseContext];

function check(rows: Row[]) {
  for (const [input, expected, context] of rows) {
    const actual = parseMessage(input, context ? { expecting: context } : undefined);
    expect(actual, `input: ${JSON.stringify(input)}`).toEqual(expected);
  }
}

describe("opt-out and help", () => {
  it("honours every carrier keyword regardless of case or punctuation", () => {
    check([
      ["STOP", { intent: "STOP" }],
      ["stop", { intent: "STOP" }],
      ["Stop.", { intent: "STOP" }],
      ["  STOP  ", { intent: "STOP" }],
      ["UNSUBSCRIBE", { intent: "STOP" }],
      ["unsubscribe!", { intent: "STOP" }],
      ["STOPALL", { intent: "STOP" }],
      ["stop all", { intent: "STOP" }],
      ["opt-out", { intent: "STOP" }],
      ["OPTOUT", { intent: "STOP" }],
      ["cancel", { intent: "STOP" }],
      ["QUIT", { intent: "STOP" }],
      ["end", { intent: "STOP" }],
      ["revoke", { intent: "STOP" }],
    ]);
  });

  it("honours an opt-out inside a short sentence", () => {
    check([
      ["please stop", { intent: "STOP" }],
      ["stop texting me", { intent: "STOP" }],
      ["stop these messages please", { intent: "STOP" }],
      ["can you stop", { intent: "STOP" }],
    ]);
  });

  it("does not read a long sentence that merely contains the word as an opt-out", () => {
    check([
      [
        "what time should i stop drinking coffee before bed tonight",
        { intent: "UNPARSED" },
      ],
    ]);
  });

  it("answers HELP", () => {
    check([
      ["HELP", { intent: "HELP" }],
      ["help", { intent: "HELP" }],
      ["Help?", { intent: "HELP" }],
      ["info", { intent: "HELP" }],
    ]);
  });

  it("resolves STOP before anything else could shadow it", () => {
    // Contains a word from another table; the opt-out still wins.
    expect(parseMessage("stop")).toEqual({ intent: "STOP" });
    expect(parseMessage("cancel")).toEqual({ intent: "STOP" });
  });
});

describe("BED", () => {
  it("reads the ways people say they are down", () => {
    check([
      ["BED", { intent: "BED" }],
      ["bed", { intent: "BED" }],
      ["Bed!", { intent: "BED" }],
      ["bed 👍", { intent: "BED" }],
      ["in bed", { intent: "BED" }],
      ["im in bed", { intent: "BED" }],
      ["I'm in bed", { intent: "BED" }],
      ["I’m in bed", { intent: "BED" }], // curly apostrophe from a phone keyboard
      ["going to bed", { intent: "BED" }],
      ["off to bed", { intent: "BED" }],
      ["lights out", { intent: "BED" }],
      ["down", { intent: "BED" }],
      ["goodnight", { intent: "BED" }],
      ["gn", { intent: "BED" }],
      ["asleep", { intent: "BED" }],
    ]);
  });
});

describe("UP", () => {
  it("reads the ways people say they are awake", () => {
    check([
      ["UP", { intent: "UP" }],
      ["up", { intent: "UP" }],
      ["Up!", { intent: "UP" }],
      ["im up", { intent: "UP" }],
      ["I'm up", { intent: "UP" }],
      ["awake", { intent: "UP" }],
      ["good morning", { intent: "UP" }],
      ["gm", { intent: "UP" }],
      ["just got up", { intent: "UP" }],
    ]);
  });
});

describe("wake times", () => {
  it("reads every format people actually type", () => {
    check([
      ["5", { intent: "WAKE_TIME", clock: "05:00" }],
      ["5:30", { intent: "WAKE_TIME", clock: "05:30" }],
      ["530", { intent: "WAKE_TIME", clock: "05:30" }],
      ["0530", { intent: "WAKE_TIME", clock: "05:30" }],
      ["5:30am", { intent: "WAKE_TIME", clock: "05:30" }],
      ["5:30 am", { intent: "WAKE_TIME", clock: "05:30" }],
      ["5:30 AM", { intent: "WAKE_TIME", clock: "05:30" }],
      ["5.30", { intent: "WAKE_TIME", clock: "05:30" }],
      ["5.30am", { intent: "WAKE_TIME", clock: "05:30" }],
      ["5am", { intent: "WAKE_TIME", clock: "05:00" }],
      ["5 am", { intent: "WAKE_TIME", clock: "05:00" }],
      ["5 a.m.", { intent: "WAKE_TIME", clock: "05:00" }],
      ["half 5", { intent: "WAKE_TIME", clock: "05:30" }],
      ["half five", { intent: "WAKE_TIME", clock: "05:30" }],
      ["half past 5", { intent: "WAKE_TIME", clock: "05:30" }],
      ["quarter past 6", { intent: "WAKE_TIME", clock: "06:15" }],
      ["quarter to 6", { intent: "WAKE_TIME", clock: "05:45" }],
      ["five", { intent: "WAKE_TIME", clock: "05:00" }],
      ["five thirty", { intent: "WAKE_TIME", clock: "05:30" }],
      ["seven o'clock", { intent: "WAKE_TIME", clock: "07:00" }],
      ["0600", { intent: "WAKE_TIME", clock: "06:00" }],
      ["1745", { intent: "WAKE_TIME", clock: "17:45" }],
      ["23:15", { intent: "WAKE_TIME", clock: "23:15" }],
    ]);
  });

  it("strips the hedging people put around a number", () => {
    check([
      ["about 5:30", { intent: "WAKE_TIME", clock: "05:30" }],
      ["around 5:30", { intent: "WAKE_TIME", clock: "05:30" }],
      ["5:30ish", { intent: "WAKE_TIME", clock: "05:30" }],
      ["maybe 6", { intent: "WAKE_TIME", clock: "06:00" }],
      ["probably 6:15", { intent: "WAKE_TIME", clock: "06:15" }],
      ["up at 5:30", { intent: "WAKE_TIME", clock: "05:30" }],
      ["i'm up at 5:30", { intent: "WAKE_TIME", clock: "05:30" }],
      ["I'll be up at about 4:45", { intent: "WAKE_TIME", clock: "04:45" }],
      ["gotta be up at 4", { intent: "WAKE_TIME", clock: "04:00" }],
      ["at 6", { intent: "WAKE_TIME", clock: "06:00" }],
      ["6 or so", { intent: "WAKE_TIME", clock: "06:00" }],
    ]);
  });

  it("reads a bare hour as morning when asking about waking", () => {
    check([
      ["3", { intent: "WAKE_TIME", clock: "03:00" }],
      ["7", { intent: "WAKE_TIME", clock: "07:00" }],
      ["11", { intent: "WAKE_TIME", clock: "11:00" }],
      ["12", { intent: "WAKE_TIME", clock: "12:00" }],
    ]);
  });

  it("reads a bare hour as evening when asking about getting down", () => {
    check([
      ["11", { intent: "WAKE_TIME", clock: "23:00" }, "bed_time"],
      ["9", { intent: "WAKE_TIME", clock: "21:00" }, "bed_time"],
      ["8:15", { intent: "WAKE_TIME", clock: "20:15" }, "bed_time"],
      ["12", { intent: "WAKE_TIME", clock: "00:00" }, "bed_time"], // midnight
      ["1", { intent: "WAKE_TIME", clock: "01:00" }, "bed_time"], // small hours
      // An explicit marker always overrides the convention.
      ["11am", { intent: "WAKE_TIME", clock: "11:00" }, "bed_time"],
      ["10:30pm", { intent: "WAKE_TIME", clock: "22:30" }, "bed_time"],
    ]);
  });

  it("handles noon and midnight markers correctly", () => {
    check([
      ["12am", { intent: "WAKE_TIME", clock: "00:00" }],
      ["12pm", { intent: "WAKE_TIME", clock: "12:00" }],
      ["12:30am", { intent: "WAKE_TIME", clock: "00:30" }],
      ["12:30pm", { intent: "WAKE_TIME", clock: "12:30" }],
      ["midnight", { intent: "WAKE_TIME", clock: "00:00" }],
      ["noon", { intent: "WAKE_TIME", clock: "12:00" }],
    ]);
  });

  it("refuses times that are not times", () => {
    check([
      ["25", { intent: "UNPARSED" }],
      ["5:75", { intent: "UNPARSED" }],
      ["2575", { intent: "UNPARSED" }],
      ["13am", { intent: "UNPARSED" }],
      ["99999", { intent: "UNPARSED" }],
      ["::", { intent: "UNPARSED" }],
      ["1234567", { intent: "UNPARSED" }],
      ["5:7", { intent: "UNPARSED" }],
    ]);
  });

  it("strips stray leading punctuation rather than refusing over it", () => {
    // Quote marks and dashes arrive from predictive keyboards and reply
    // threading. The interpreted time is echoed back, so a stray character
    // costs nothing while refusing outright costs a round trip.
    check([
      ["-5", { intent: "WAKE_TIME", clock: "05:00" }],
      ["5:", { intent: "WAKE_TIME", clock: "05:00" }],
      ['"5:30"', { intent: "WAKE_TIME", clock: "05:30" }],
      ["…6", { intent: "WAKE_TIME", clock: "06:00" }],
    ]);
  });
});

describe("durations", () => {
  it("reads spans of sleep", () => {
    check([
      ["about 7 hours", { intent: "DURATION", minutes: 420 }],
      ["7 hours", { intent: "DURATION", minutes: 420 }],
      ["7hrs", { intent: "DURATION", minutes: 420 }],
      ["7h", { intent: "DURATION", minutes: 420 }],
      ["7.5 hours", { intent: "DURATION", minutes: 450 }],
      ["7,5 hours", { intent: "DURATION", minutes: 450 }],
      ["7 and a half hours", { intent: "DURATION", minutes: 450 }],
      ["seven and a half hours", { intent: "DURATION", minutes: 450 }],
      ["7h30m", { intent: "DURATION", minutes: 450 }],
      ["7 hrs 30 mins", { intent: "DURATION", minutes: 450 }],
      ["seven hours", { intent: "DURATION", minutes: 420 }],
      ["6 hours", { intent: "DURATION", minutes: 360 }],
      ["90 minutes", { intent: "DURATION", minutes: 90 }],
      ["roughly 8 hours", { intent: "DURATION", minutes: 480 }],
    ]);
  });

  it("prefers a duration over a clock time when a unit is present", () => {
    // The single case where the two grammars overlap.
    expect(parseMessage("7")).toEqual({ intent: "WAKE_TIME", clock: "07:00" });
    expect(parseMessage("7 hours")).toEqual({ intent: "DURATION", minutes: 420 });
  });

  it("reports what was written and leaves plausibility to the guards", () => {
    // 18 hours is not a real night, but the parser's job is faithfulness. The
    // 2–14 h window is enforced downstream, where the record can be flagged.
    expect(parseMessage("18 hours")).toEqual({ intent: "DURATION", minutes: 1080 });
    // Beyond a day is not a duration anyone means.
    expect(parseMessage("30 hours")).toEqual({ intent: "UNPARSED" });
  });
});

describe("no match", () => {
  it("returns UNPARSED rather than guessing", () => {
    check([
      ["", { intent: "UNPARSED" }],
      ["   ", { intent: "UNPARSED" }],
      ["👍", { intent: "UNPARSED" }],
      ["ok", { intent: "UNPARSED" }],
      ["what", { intent: "UNPARSED" }],
      ["who is this", { intent: "UNPARSED" }],
      ["idk", { intent: "UNPARSED" }],
      ["depends on practice", { intent: "UNPARSED" }],
      ["my coach said to run 6 miles tomorrow", { intent: "UNPARSED" }],
      ["🛏️", { intent: "UNPARSED" }],
    ]);
  });

  it("never throws on hostile input", () => {
    for (const input of [
      "a".repeat(5000),
      " ",
      "'; DROP TABLE SleepLog; --",
      "🏃‍♂️🏃‍♀️🏃",
      "٥:٣٠", // Arabic-Indic digits
    ]) {
      expect(() => parseMessage(input)).not.toThrow();
    }
  });
});
