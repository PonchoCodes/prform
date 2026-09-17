// The Monday digest: one email a week, built from what units 1 to 3 already
// derive, so the coach who does not open the dashboard still sees the
// consequence of last week and the shape of the next one.
//
// Four sections, in the order a coach acts on them: who needs attention
// today, the next meet, this week's sessions with their forecasts, and last
// week's rates against the week before. Every line is a count, a rate, a
// colour or a weekday; the input carries no hours and the output carries
// none, and digest.test.ts walks subject, text and every section through
// lib/team/coachCopyGuard.ts.
//
// The attention lines are built here from each athlete's own signals rather
// than reusing the exception list's per-bucket recommendation: two athletes
// in the same colour with different short nights, different gaps and a
// different next session read differently, and a digest that said the same
// sentence four times would be skimmed on the second Monday.
//
// Pure — no server imports, no clock.

import { addDays, weekStartOf, weekdayName, type DateKey } from "@/lib/dateKeys";
import type { AthleteStatusColor } from "@/lib/team/status";
import type { MeetReadiness } from "@/lib/team/meetReadiness";
import type { SessionForecast } from "@/lib/sessionForecast";
import type { TeamTrend, TeamTrendWeek } from "@/lib/teamTrend";
import { isHardWorkout } from "@/lib/workoutTypes";

export interface DigestAttentionEntry {
  name: string;
  color: AthleteStatusColor;
  /** "Short on sleep 3 of 5 nights" from deriveAthleteStatus. */
  trend: string;
  shortDays: string[];
  unlogged: number;
  nightsLogged: number;
}

export interface DigestSession {
  date: DateKey;
  sessionType: string;
  forecast: SessionForecast | null;
}

export interface DigestInput {
  teamName: string;
  /** The day the digest goes out, in the team's zone. */
  today: DateKey;
  rosterSize: number;
  attention: DigestAttentionEntry[];
  meet: MeetReadiness | null;
  /** The coming week's sessions, today onward, date order. */
  sessions: DigestSession[];
  trend: TeamTrend;
}

export interface DigestSection {
  title: string;
  lines: string[];
}

export interface Digest {
  subject: string;
  headline: string;
  sections: DigestSection[];
  /** The plain-text body, the sections joined. */
  text: string;
}

/** How many athletes the meet section names before summarising the rest. */
const MEET_LINES = 4;

function listNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function capitalise(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

function nights(n: number): string {
  return `${n} night${n === 1 ? "" : "s"}`;
}

function pctOrNone(n: number | null): string {
  return n === null ? "nothing logged" : `${n}%`;
}

/**
 * One line per flagged athlete, from their own week. The next hard session
 * is named because it is the lever the coach actually holds this week.
 */
export function attentionLine(e: DigestAttentionEntry, nextHardDay: string | null): string {
  if (e.nightsLogged === 0) {
    return `Nothing logged in the last ${nights(e.unlogged)}. Ask before assuming.`;
  }

  const short = e.shortDays.length > 0 ? `short ${listNames(e.shortDays)}` : null;
  const gaps = e.unlogged > 0 ? `${nights(e.unlogged)} unlogged` : null;
  const facts = [short, gaps].filter(Boolean).join(", ");

  if (e.color === "red") {
    const lever = nextHardDay
      ? `Make ${nextHardDay} aerobic; the pattern costs more than the session returns.`
      : `Nothing hard is on the calendar; keep it that way until two full nights land.`;
    return `${capitalise(facts || e.trend)}. ${lever}`;
  }

  // Amber: two short nights, or too little to call.
  const watch = nextHardDay
    ? `Run ${nextHardDay} as planned only if tonight lands.`
    : `One more short night and the next hard session should move.`;
  return `${capitalise(facts || e.trend)}. ${watch}`;
}

function attentionSection(input: DigestInput, nextHardDay: string | null): DigestSection {
  if (input.rosterSize === 0) {
    return { title: "Needs attention", lines: ["No athletes on the roster yet."] };
  }
  if (input.attention.length === 0) {
    return {
      title: "Needs attention",
      lines: [`All ${input.rosterSize} on track. Nothing needs you this morning.`],
    };
  }
  const lines = input.attention.map(
    (e) => `${e.name} (${e.color}): ${attentionLine(e, nextHardDay)}`,
  );
  const onTrack = input.rosterSize - input.attention.length;
  if (onTrack > 0) lines.push(`${onTrack} of ${input.rosterSize} on track and not listed.`);
  return { title: "Needs attention", lines };
}

function meetSection(meet: MeetReadiness | null): DigestSection | null {
  if (!meet) return null;
  const when =
    meet.daysOut === 0 ? "today" : meet.daysOut === 1 ? "tomorrow" : `${meet.daysOut} days out`;
  const lines = [`${meet.meet.name}, ${when}. ${meet.summary}.`];
  for (const a of meet.athletes.slice(0, MEET_LINES)) {
    lines.push(`${a.name} (${a.readiness}, ${a.ramp.replace("_", " ")}): ${a.line}`);
  }
  const rest = meet.athletes.length - MEET_LINES;
  if (rest > 0) lines.push(`${rest} more on the dashboard.`);
  if (meet.noData.length > 0) {
    lines.push(`${meet.noData.length} with nothing logged: ${listNames(meet.noData.map((a) => a.name))}.`);
  }
  return { title: "Next meet", lines };
}

function sessionsSection(sessions: DigestSession[]): DigestSection {
  if (sessions.length === 0) {
    return { title: "This week", lines: ["Nothing planned. Sessions you add get a forecast here."] };
  }
  const lines = sessions.map((s) => {
    const label = `${weekdayName(s.date)} ${s.sessionType.replace("_", " ")}`;
    if (!s.forecast) return `${label}.`;
    const parts = [label + ".", s.forecast.note, s.forecast.shift].filter(Boolean);
    return parts.join(" ");
  });
  return { title: "This week", lines };
}

function findWeek(trend: TeamTrend, weekStart: DateKey): TeamTrendWeek | undefined {
  return trend.weeks.find((w) => w.weekStart === weekStart);
}

function weekSection(input: DigestInput): DigestSection {
  const lastWeekStart = addDays(weekStartOf(input.today), -7);
  const last = findWeek(input.trend, lastWeekStart);
  const prior = findWeek(input.trend, addDays(lastWeekStart, -7));

  if (!last || last.nightsLogged === 0) {
    return { title: "Last week", lines: ["Nothing logged last week."] };
  }

  const lines = [
    `Targets hit ${pctOrNone(last.compliance)}${prior ? ` (${pctOrNone(prior.compliance)} the week before)` : ""}.`,
    `Nights logged ${pctOrNone(last.loggingRate)}, ${last.nightsLogged} of ${last.nightsPossible}${
      prior ? ` (${pctOrNone(prior.loggingRate)} the week before)` : ""
    }.`,
    `${nights(last.shortNights)} short${prior ? `, ${prior.shortNights} the week before` : ""}.`,
  ];
  if (last.hardSessionDays.length > 0) {
    lines.push(`${last.hardSessionDays.length} hard session${last.hardSessionDays.length === 1 ? "" : "s"} planned.`);
  }
  return { title: "Last week", lines };
}

export function buildDigest(input: DigestInput): Digest {
  const nextHard = input.sessions.find((s) => isHardWorkout(s.sessionType));
  const nextHardDay = nextHard ? weekdayName(nextHard.date) : null;

  const sections = [
    attentionSection(input, nextHardDay),
    meetSection(input.meet),
    sessionsSection(input.sessions),
    weekSection(input),
  ].filter((s): s is DigestSection => s !== null);

  const flagged = input.attention.length;
  const headline =
    input.rosterSize === 0
      ? `${input.teamName}: no athletes yet`
      : flagged === 0
        ? `${input.teamName}: everyone on track`
        : `${input.teamName}: ${flagged} need${flagged === 1 ? "s" : ""} attention`;

  const text = sections
    .map((s) => `${s.title.toUpperCase()}\n${s.lines.map((l) => `- ${l}`).join("\n")}`)
    .join("\n\n");

  return { subject: headline, headline, sections, text };
}
