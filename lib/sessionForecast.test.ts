import { describe, it, expect } from "vitest";
import {
  athleteReadinessFor,
  forecastSession,
  forecastSessions,
  type AthleteForForecast,
  type ForecastContext,
  type SessionForForecast,
} from "@/lib/sessionForecast";
import { findSleepValueLeaks, findSleepValueLeaksInPayload } from "@/lib/team/coachCopyGuard";

// Wednesday.
const TODAY = "2026-09-16";

const green: AthleteForForecast = { name: "G", color: "green", sleepDebtMinutes: 0, nightsLogged: 7 };
const amber: AthleteForForecast = { name: "A", color: "amber", sleepDebtMinutes: 70, nightsLogged: 7 };
const red: AthleteForForecast = { name: "R", color: "red", sleepDebtMinutes: 150, nightsLogged: 7 };
const silent: AthleteForForecast = { name: "S", color: "amber", sleepDebtMinutes: null, nightsLogged: 0 };
// Green by colour (no night short enough to count) but an hour down over the week.
const tired: AthleteForForecast = { name: "T", color: "green", sleepDebtMinutes: 65, nightsLogged: 7 };

function session(id: string, date: string, sessionType = "track"): SessionForForecast {
  return { id, date, sessionType };
}

function ctx(sessions: SessionForForecast[] = [], meetDate: string | null = null): ForecastContext {
  return { today: TODAY, sessions, meetDate };
}

describe("athleteReadinessFor", () => {
  it("reads a hard session today straight off the week's colour and debt", () => {
    const s = session("s", TODAY);
    expect(athleteReadinessFor(green, s, ctx([s]))).toBe("ready");
    expect(athleteReadinessFor(amber, s, ctx([s]))).toBe("marginal");
    expect(athleteReadinessFor(red, s, ctx([s]))).toBe("not_ready");
    expect(athleteReadinessFor(tired, s, ctx([s]))).toBe("marginal");
  });

  it("treats an unlogged athlete as marginal for hard work, not as fine", () => {
    const s = session("s", TODAY);
    expect(athleteReadinessFor(silent, s, ctx([s]))).toBe("marginal");
  });

  it("lifts one step when there are two nights to recover in, but a red week stays marginal", () => {
    const s = session("s", "2026-09-18");
    expect(athleteReadinessFor(amber, s, ctx([s]))).toBe("ready");
    expect(athleteReadinessFor(red, s, ctx([s]))).toBe("marginal");
    expect(athleteReadinessFor(tired, s, ctx([s]))).toBe("ready");
  });

  it("only refuses easy work to a red week with no night to recover first", () => {
    expect(athleteReadinessFor(red, session("e", TODAY, "easy"), ctx())).toBe("not_ready");
    expect(athleteReadinessFor(red, session("e", "2026-09-18", "easy"), ctx())).toBe("ready");
    expect(athleteReadinessFor(amber, session("e", TODAY, "easy"), ctx())).toBe("ready");
  });

  it("docks a hard session that sits next to another hard session", () => {
    const tempo = session("t", "2026-09-19", "tempo");
    const track = session("k", "2026-09-20", "track");
    expect(athleteReadinessFor(green, track, ctx([tempo, track]))).toBe("marginal");
    expect(athleteReadinessFor(green, track, ctx([track]))).toBe("ready");
  });

  it("caps a hard session on the eve of the meet at marginal", () => {
    const s = session("s", "2026-09-25");
    expect(athleteReadinessFor(green, s, ctx([s], "2026-09-26"))).toBe("marginal");
  });
});

describe("forecastSession", () => {
  it("splits a hard session into counts and says so", () => {
    const s = session("s", TODAY);
    const f = forecastSession(s, [green, amber, red, silent], ctx([s]));
    expect(f).toMatchObject({ hard: true, ready: 1, marginal: 2, notReady: 1, unlogged: 1 });
    expect(f.note).toBe("1 ready, 2 marginal, 1 not ready. 1 athlete with nothing logged.");
  });

  it("names the adjacent hard session by weekday and type", () => {
    const tempo = session("t", "2026-09-17", "tempo");
    const track = session("k", "2026-09-18", "track");
    const f = forecastSession(track, [green], ctx([tempo, track]));
    expect(f.note).toMatch(/Back to back with Thursday's tempo\./);
  });

  it("says nothing for an easy session everyone can do, and counts the exceptions otherwise", () => {
    expect(forecastSession(session("e", "2026-09-18", "easy"), [green, amber, red], ctx()).note).toBe("");
    const f = forecastSession(session("e", TODAY, "easy"), [green, red], ctx());
    expect(f).toMatchObject({ hard: false, notReady: 1 });
    expect(f.note).toBe("1 not ready even for easy work.");
  });

  it("suggests a one-day move when it raises the ready count", () => {
    // Tomorrow: one night to recover, not enough. The day after: enough.
    const s = session("s", "2026-09-17");
    const f = forecastSession(s, [amber, amber, green], ctx([s]));
    expect(f.ready).toBe(1);
    expect(f.shift).toBe("Moving it to Friday would put 3 ready instead of 1.");
  });

  it("suggests moving off a back-to-back, and never onto a day that already has a hard session", () => {
    const tempo = session("t", "2026-09-20", "tempo");
    const track = session("k", "2026-09-21", "track");
    const f = forecastSession(track, [green, green], ctx([tempo, track]));
    expect(f.ready).toBe(0);
    // Sunday the 20th is taken; Tuesday the 22nd is clear.
    expect(f.shift).toBe("Moving it to Tuesday would put 2 ready instead of 0.");
  });

  it("makes no suggestion when nothing would improve", () => {
    const s = session("s", "2026-09-19");
    expect(forecastSession(s, [green, green], ctx([s])).shift).toBeNull();
  });

  it("never suggests moving a session into the past", () => {
    const s = session("s", TODAY);
    const f = forecastSession(s, [amber], ctx([s]));
    expect(f.shift === null || !f.shift.includes("Tuesday")).toBe(true);
  });
});

describe("forecastSessions", () => {
  it("skips sessions that have already happened", () => {
    const past = session("p", "2026-09-14");
    const soon = session("n", "2026-09-18");
    const out = forecastSessions([past, soon], [green], ctx([past, soon]));
    expect(out.map((f) => f.sessionId)).toEqual(["n"]);
  });

  it("never emits a clock time or an hours value in any note, suggestion or key", () => {
    const sessions = [
      session("a", TODAY, "track"),
      session("b", "2026-09-17", "tempo"),
      session("c", "2026-09-18", "easy"),
      session("d", "2026-09-20", "long_run"),
      session("e", "2026-09-21", "track"),
      session("f", "2026-09-25", "race"),
    ];
    const out = forecastSessions(sessions, [green, amber, red, silent, tired], ctx(sessions, "2026-09-26"));
    for (const f of out) {
      expect(findSleepValueLeaks(f.note), f.note).toEqual([]);
      if (f.shift) expect(findSleepValueLeaks(f.shift), f.shift).toEqual([]);
    }
    expect(findSleepValueLeaksInPayload(out)).toEqual([]);
  });
});
