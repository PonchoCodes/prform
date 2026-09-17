// The next team meet, as the person running the team is allowed to see it.
//
// Per athlete: a readiness colour (the same one the exception list shows), a
// ramp status, and one line built from that athlete's own signals — which
// nights were short, how many went unlogged, how many nights are left, and
// whether a hard session sits between here and the meet. Two athletes on the
// same colour get different lines because the signals differ, and the tests
// hold that: canned copy per bucket is what this replaces.
//
// Same contract as lib/team/status.ts. Counts, colours and weekday names go
// out; no clock time and no hours value ever does. lib/team/coachCopyGuard.ts
// is the check and meetReadiness.test.ts applies it to every line.
//
// Pure — dates in as "YYYY-MM-DD", no server imports, no clock.

import { addDays, daysBetween, earlierOf, laterOf, toUtc, type DateKey } from "@/lib/dateKeys";
import {
  deriveAthleteStatus,
  isShortNight,
  type AthleteStatusColor,
  type NightForStatus,
} from "@/lib/team/status";

/**
 * The ramp, for this view, is the phase-advance window: the ten nights before
 * the meet, which is where calculateSleepPlan moves bedtime night by night.
 * The extension window before it is gentler and is not what a coach is
 * asking about in meet week.
 */
export const RAMP_DAYS = 10;

/**
 * Share of scoreable ramp nights on target before an athlete counts as on it.
 * One miss a week keeps them on the ramp (6 of 7 is 86%); two does not (5 of
 * 7 is 71%). That is the same line the exception list draws for amber, so the
 * two views cannot disagree about the same week.
 */
const ON_RAMP_RATE = 0.8;

/** Nights read when the ramp has not opened yet: what they bring into it. */
const PRE_RAMP_WINDOW_DAYS = 7;

export type RampStatus = "on_ramp" | "behind" | "no_data";

export interface NightForMeet extends NightForStatus {
  /** The plan's own verdict on the night, frozen at log time. */
  hitTarget?: boolean | null;
}

export interface AthleteForMeet {
  name: string;
  joinedOn: DateKey;
  /** Every night the caller could find for this athlete; the window is cut here. */
  nights: NightForMeet[];
}

export interface MeetForReadiness {
  name: string;
  date: DateKey;
  distances: string;
}

export interface MeetReadinessInput {
  meet: MeetForReadiness;
  today: DateKey;
  athletes: AthleteForMeet[];
  /** Team sessions that count as hard, dated. Used only to name the next one. */
  hardSessionDates: DateKey[];
}

export interface AthleteMeetReadiness {
  name: string;
  readiness: AthleteStatusColor;
  ramp: RampStatus;
  line: string;
}

export interface MeetReadiness {
  meet: MeetForReadiness;
  daysOut: number;
  /** True once the ten-night ramp has started. */
  rampOpen: boolean;
  /** Days until it does; 0 when open. */
  rampOpensIn: number;
  /** Worst first. Athletes with nothing logged in the window are in `noData`. */
  athletes: AthleteMeetReadiness[];
  noData: AthleteMeetReadiness[];
  /** "4 of 6 on the ramp" */
  summary: string;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function weekdayName(date: DateKey): string {
  return WEEKDAYS[toUtc(date).getUTCDay()];
}

/** "Tuesday", "Tuesday and Thursday", "Monday, Tuesday and Thursday". */
function listNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function nightOnTarget(n: NightForMeet): boolean | null {
  if (n.needsReview) return null;
  if (n.hitTarget != null) return n.hitTarget;
  if (n.actualSleepHours == null) return null;
  return !isShortNight(n);
}

const COLOR_RANK: Record<AthleteStatusColor, number> = { red: 0, amber: 1, green: 2 };
const RAMP_RANK: Record<RampStatus, number> = { behind: 0, on_ramp: 1, no_data: 2 };

export function deriveMeetReadiness(input: MeetReadinessInput): MeetReadiness {
  const { meet, today, hardSessionDates } = input;
  const daysOut = daysBetween(today, meet.date);
  const rampStart = addDays(meet.date, -RAMP_DAYS);
  const rampOpen = today >= rampStart;
  const rampOpensIn = rampOpen ? 0 : daysBetween(today, rampStart);
  // Last night is the newest night that can have been logged.
  const windowEnd = addDays(today, -1);

  const nextHard = hardSessionDates
    .filter((d) => d >= today && d < meet.date)
    .sort()[0];

  const rows = input.athletes.map((athlete) => {
    // Never fewer than a week of nights. On the day the ramp opens there are
    // no ramp nights yet, and a view that said "no data" about an athlete who
    // logged all week would be wrong; the window widens to the full ramp as
    // the ramp fills.
    const windowStart = laterOf(
      earlierOf(rampStart, addDays(today, -PRE_RAMP_WINDOW_DAYS)),
      athlete.joinedOn,
    );
    const inWindow = athlete.nights
      .filter((n) => n.date >= windowStart && n.date <= windowEnd)
      .sort((a, b) => (a.date < b.date ? -1 : 1));
    const last7 = athlete.nights.filter(
      (n) => n.date >= addDays(today, -PRE_RAMP_WINDOW_DAYS) && n.date <= windowEnd,
    );

    const readiness = deriveAthleteStatus(last7, PRE_RAMP_WINDOW_DAYS).color;

    let scoreable = 0;
    let hit = 0;
    const shortDays: string[] = [];
    for (const n of inWindow) {
      const on = nightOnTarget(n);
      if (on === null) continue;
      scoreable++;
      if (on) hit++;
      if (isShortNight(n)) shortDays.push(weekdayName(n.date));
    }
    const possible = Math.max(0, daysBetween(windowStart, windowEnd) + 1);
    const unlogged = Math.max(0, possible - inWindow.length);

    const ramp: RampStatus =
      scoreable === 0 ? "no_data" : hit / scoreable >= ON_RAMP_RATE ? "on_ramp" : "behind";

    const line = buildLine({
      readiness,
      ramp,
      hit,
      scoreable,
      shortDays,
      unlogged,
      possible,
      daysOut,
      rampOpen,
      rampOpensIn,
      meetDay: weekdayName(meet.date),
      nextHard: nextHard ? weekdayName(nextHard) : null,
    });

    return { row: { name: athlete.name, readiness, ramp, line }, shortCount: shortDays.length };
  });

  const scored = rows
    .filter((r) => r.row.ramp !== "no_data")
    .sort(
      (a, b) =>
        COLOR_RANK[a.row.readiness] - COLOR_RANK[b.row.readiness] ||
        RAMP_RANK[a.row.ramp] - RAMP_RANK[b.row.ramp] ||
        b.shortCount - a.shortCount ||
        a.row.name.localeCompare(b.row.name),
    )
    .map((r) => r.row);
  const noData = rows
    .filter((r) => r.row.ramp === "no_data")
    .map((r) => r.row)
    .sort((a, b) => a.name.localeCompare(b.name));

  const onRamp = scored.filter((r) => r.ramp === "on_ramp").length;
  const total = input.athletes.length;
  const summary = rampOpen
    ? `${onRamp} of ${total} on the ramp`
    : `Ramp opens in ${rampOpensIn} day${rampOpensIn === 1 ? "" : "s"}. ${onRamp} of ${total} arriving on target`;

  return { meet, daysOut, rampOpen, rampOpensIn, athletes: scored, noData, summary };
}

interface LineSignals {
  readiness: AthleteStatusColor;
  ramp: RampStatus;
  hit: number;
  scoreable: number;
  shortDays: string[];
  unlogged: number;
  possible: number;
  daysOut: number;
  rampOpen: boolean;
  rampOpensIn: number;
  meetDay: string;
  nextHard: string | null;
}

function nights(n: number): string {
  return `${n} night${n === 1 ? "" : "s"}`;
}

/**
 * One sentence or two, from the athlete's own numbers. Every clause is
 * conditional on a signal, so the only way two athletes read the same is for
 * them to have logged the same week — which is the correct outcome.
 */
function buildLine(s: LineSignals): string {
  const parts: string[] = [];
  const left = `${nights(s.daysOut)} to ${s.meetDay}`;

  if (s.ramp === "no_data") {
    parts.push(
      s.possible === 0
        ? `Joined too recently to have a night in the window.`
        : `Nothing logged in the last ${nights(s.possible)}.`,
    );
    parts.push(
      s.rampOpen
        ? `The ramp is ${nights(s.daysOut)} from the meet and there is no read on it.`
        : `Ramp opens in ${s.rampOpensIn} day${s.rampOpensIn === 1 ? "" : "s"}; nothing to go on until they log.`,
    );
    return parts.join(" ");
  }

  if (!s.rampOpen) {
    parts.push(`Ramp opens in ${s.rampOpensIn} day${s.rampOpensIn === 1 ? "" : "s"}.`);
  }

  const short = s.shortDays.length > 0 ? `short ${listNames(s.shortDays)}` : null;

  if (s.ramp === "on_ramp") {
    if (s.readiness === "green") {
      parts.push(
        `On target ${s.hit} of ${nights(s.scoreable)}${short ? `, ${short}` : ""}. ${left}; keep the plan as it is.`,
      );
    } else {
      parts.push(
        `On the ramp ${s.hit} of ${nights(s.scoreable)} but ${short ?? "slipping"}. ${left}; tonight decides whether they stay on it.`,
      );
    }
  } else {
    // behind
    if (s.readiness === "red") {
      parts.push(
        `${short ? `${short[0].toUpperCase()}${short.slice(1)}` : "Behind the ramp"}, on target ${s.hit} of ${nights(s.scoreable)}. ${left}.`,
      );
      parts.push(
        s.nextHard
          ? `Make ${s.nextHard} aerobic; on this pattern the hard session costs more than the meet gets back.`
          : `Nothing hard is planned before the meet, so sleep is the only lever left.`,
      );
    } else if (s.readiness === "amber") {
      parts.push(
        `Behind the ramp, on target ${s.hit} of ${nights(s.scoreable)}${short ? `, ${short}` : ""}. ${left}.`,
      );
      parts.push(
        s.nextHard
          ? `Run ${s.nextHard} as planned only if tonight lands.`
          : `Two on-target nights in a row puts them back on it.`,
      );
    } else {
      // Enough sleep but late against the ramp's bedtime: duration is fine,
      // timing is not, and the fix is different.
      parts.push(
        `Sleeping enough but late against the ramp on ${s.scoreable - s.hit} of ${nights(s.scoreable)}. ${left} to bring bedtime forward.`,
      );
    }
  }

  if (s.unlogged > 0) {
    parts.push(`${nights(s.unlogged)} unlogged in the window.`);
  }

  return parts.join(" ");
}
