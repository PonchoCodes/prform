// What a planned session gives back: how many athletes are forecast ready for
// it, marginal, and not ready, and whether moving it a day would help.
//
// The signals are the ones the verdict already reasons from — the colour of
// the trailing week (lib/team/status.ts), accumulated sleep debt
// (computeSleepDebtMinutes in lib/verdict.ts), and how many nights were logged
// at all — plus two things only a coach's calendar knows: whether the session
// sits next to another hard one, and whether it sits on the eve of a meet.
//
// Nights between today and the session are nights an athlete can recover in.
// Two of them lift the forecast one step. That is the whole reason the shift
// suggestion can say anything: a session moved a day later is a session with
// one more night before it, and a session moved off a back-to-back is a
// session without the adjacent load. A red week never forecasts better than
// marginal, however far out the session is — three short nights in seven is
// a pattern, and a pattern does not reverse because the calendar moved.
//
// Counts go out, and a note built from them; no athlete is named, and no
// hours value or clock time can appear. sessionForecast.test.ts holds every
// note and suggestion to lib/team/coachCopyGuard.ts.
//
// Pure — no server imports, no clock.

import { addDays, daysBetween, weekdayName, type DateKey } from "@/lib/dateKeys";
import { isHardWorkout } from "@/lib/workoutTypes";
import type { AthleteStatusColor } from "@/lib/team/status";

export type SessionReadiness = "ready" | "marginal" | "not_ready";

export interface AthleteForForecast {
  /** Kept for callers that group by athlete; never emitted by this module. */
  name: string;
  /** deriveAthleteStatus over the trailing week. */
  color: AthleteStatusColor;
  /** computeSleepDebtMinutes over the same week. Null when nothing scoreable. */
  sleepDebtMinutes: number | null;
  nightsLogged: number;
}

export interface SessionForForecast {
  id: string;
  date: DateKey;
  sessionType: string;
}

export interface ForecastContext {
  today: DateKey;
  /** Every team session on the calendar, so adjacency is visible. */
  sessions: SessionForForecast[];
  /** The next team meet, if any. */
  meetDate: DateKey | null;
}

export interface SessionForecast {
  sessionId: string;
  date: DateKey;
  hard: boolean;
  ready: number;
  marginal: number;
  notReady: number;
  /** Athletes with nothing logged, counted inside `marginal` and named here. */
  unlogged: number;
  /** One line. Empty for an easy session nobody is unready for. */
  note: string;
  /**
   * The qualifiers inside `note` (a back-to-back, the eve of the meet,
   * athletes with nothing logged), for a table that renders the counts as
   * numbers and only needs the words.
   */
  flags: string[];
  /** One line, or null: moving the session a day would raise the ready count. */
  shift: string | null;
}

/** Sleep debt at which a hard session is marginal, matching the verdict's hour. */
const DEBT_MARGINAL_MINUTES = 60;
/** Two hours down: not ready, whatever the colour says. */
const DEBT_NOT_READY_MINUTES = 120;
/** Nights before the session that lift the forecast one step. */
const RECOVERY_NIGHTS = 2;

const BY_LEVEL: SessionReadiness[] = ["not_ready", "marginal", "ready"];

function clamp(level: number): number {
  return Math.max(0, Math.min(2, level));
}

/** Another hard team session the day before or the day after `date`. */
function adjacentHard(date: DateKey, sessionId: string, sessions: SessionForForecast[]): DateKey | null {
  const before = addDays(date, -1);
  const after = addDays(date, 1);
  const hit = sessions.find(
    (s) => s.id !== sessionId && isHardWorkout(s.sessionType) && (s.date === before || s.date === after),
  );
  return hit ? hit.date : null;
}

function sameDayHard(date: DateKey, sessionId: string, sessions: SessionForForecast[]): boolean {
  return sessions.some((s) => s.id !== sessionId && isHardWorkout(s.sessionType) && s.date === date);
}

export function athleteReadinessFor(
  athlete: AthleteForForecast,
  session: SessionForForecast,
  ctx: ForecastContext,
): SessionReadiness {
  const hard = isHardWorkout(session.sessionType);
  const nightsBefore = Math.max(0, daysBetween(ctx.today, session.date));

  if (athlete.nightsLogged === 0) return hard ? "marginal" : "ready";

  if (!hard) {
    // Easy work is what a short week is recovered with. The only athlete not
    // ready for it is one in a red week with no night to recover in first.
    return athlete.color === "red" && nightsBefore < RECOVERY_NIGHTS ? "not_ready" : "ready";
  }

  let level = athlete.color === "green" ? 2 : athlete.color === "amber" ? 1 : 0;

  if (athlete.sleepDebtMinutes != null) {
    if (athlete.sleepDebtMinutes >= DEBT_NOT_READY_MINUTES) level = Math.min(level, 0);
    else if (athlete.sleepDebtMinutes >= DEBT_MARGINAL_MINUTES) level = Math.min(level, 1);
  }

  if (nightsBefore >= RECOVERY_NIGHTS) level = clamp(level + 1);
  if (athlete.color === "red") level = Math.min(level, 1);

  if (adjacentHard(session.date, session.id, ctx.sessions)) level = clamp(level - 1);
  if (ctx.meetDate && session.date === addDays(ctx.meetDate, -1)) level = Math.min(level, 1);

  return BY_LEVEL[level];
}

interface Counts {
  ready: number;
  marginal: number;
  notReady: number;
}

function countFor(
  session: SessionForForecast,
  athletes: AthleteForForecast[],
  ctx: ForecastContext,
): Counts {
  const counts: Counts = { ready: 0, marginal: 0, notReady: 0 };
  for (const a of athletes) {
    const r = athleteReadinessFor(a, session, ctx);
    if (r === "ready") counts.ready++;
    else if (r === "marginal") counts.marginal++;
    else counts.notReady++;
  }
  return counts;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export function forecastSession(
  session: SessionForForecast,
  athletes: AthleteForForecast[],
  ctx: ForecastContext,
): SessionForecast {
  const hard = isHardWorkout(session.sessionType);
  const counts = countFor(session, athletes, ctx);
  const unlogged = athletes.filter((a) => a.nightsLogged === 0).length;
  const adjacent = hard ? adjacentHard(session.date, session.id, ctx.sessions) : null;
  const eve = Boolean(hard && ctx.meetDate && session.date === addDays(ctx.meetDate, -1));

  const flags: string[] = [];
  if (hard) {
    if (adjacent) {
      const adjType = ctx.sessions.find((s) => s.date === adjacent && isHardWorkout(s.sessionType))?.sessionType;
      flags.push(`Back to back with ${weekdayName(adjacent)}${adjType ? `'s ${adjType.replace("_", " ")}` : ""}.`);
    }
    if (eve) flags.push("The day before the meet.");
    if (unlogged > 0) flags.push(`${plural(unlogged, "athlete")} with nothing logged.`);
  }
  const lead = hard
    ? `${counts.ready} ready, ${counts.marginal} marginal, ${counts.notReady} not ready.`
    : counts.notReady > 0
      ? `${counts.notReady} not ready even for easy work.`
      : "";
  const parts = lead ? [lead, ...flags] : [];

  // One suggestion per row. Both neighbours are tried; the better one is
  // named only when it actually raises the ready count, and never when it
  // would land on a day that already has a hard session or has passed.
  let shift: string | null = null;
  if (hard && athletes.length > 0) {
    let best: { date: DateKey; ready: number } | null = null;
    for (const delta of [1, -1]) {
      const date = addDays(session.date, delta);
      if (date < ctx.today) continue;
      if (sameDayHard(date, session.id, ctx.sessions)) continue;
      const moved = countFor({ ...session, date }, athletes, ctx);
      if (moved.ready > counts.ready && (!best || moved.ready > best.ready)) {
        best = { date, ready: moved.ready };
      }
    }
    if (best) {
      shift = `Moving it to ${weekdayName(best.date)} would put ${best.ready} ready instead of ${counts.ready}.`;
    }
  }

  return {
    sessionId: session.id,
    date: session.date,
    hard,
    ...counts,
    unlogged,
    note: parts.join(" "),
    flags,
    shift,
  };
}

/** Forecasts for every session on or after today. Past sessions have nothing to forecast. */
export function forecastSessions(
  sessions: SessionForForecast[],
  athletes: AthleteForForecast[],
  ctx: ForecastContext,
): SessionForecast[] {
  return sessions
    .filter((s) => s.date >= ctx.today)
    .map((s) => forecastSession(s, athletes, ctx));
}
