// Everything the coach dashboard derives, loaded in one place.
//
// Four routes and the Monday digest all need the same views of the same
// rows: the exception list, the next meet, the session forecasts and the
// team trend. Each loader here reads the sleep rows it needs and hands them
// to a pure module in lib/, so the rows die inside this file and the caller
// only ever holds the derived output. A route adds a guard; the cron adds
// a loop; neither repeats a query.
//
// Every loader takes the roster it should read rather than looking it up,
// because the roster is what assertCoachAccess returns after the ownership
// check, the entitlement check and the consent filter. There is no path
// into these functions that has not been through that guard first.

import { prisma } from "@/lib/prisma";
import { deriveAthleteStatus, isShortNight, type AthleteStatus } from "@/lib/team/status";
import { deriveMeetReadiness, RAMP_DAYS, type MeetReadiness } from "@/lib/team/meetReadiness";
import { forecastSessions, type AthleteForForecast, type SessionForecast } from "@/lib/sessionForecast";
import { buildTeamTrend, DEFAULT_WEEKS, type TeamTrend } from "@/lib/teamTrend";
import { computeSleepDebtMinutes } from "@/lib/verdict";
import { isHardWorkout } from "@/lib/workoutTypes";
import { addDays, toKey, toUtc, todayKey, weekStartOf, weekdayName, type DateKey } from "@/lib/dateKeys";

/** The trailing week the exception list scores. */
export const STATUS_WINDOW_DAYS = 7;

export interface RosterAthlete {
  userId: string;
  membershipId: string;
  name: string;
  joinedAt: Date;
}

// ── the exception list ──────────────────────────────────────────────────────

export interface AttentionEntry extends AthleteStatus {
  membershipId: string;
  name: string;
  /** Weekday names of the short nights, oldest first. */
  shortDays: string[];
  /** Nights in the window with nothing logged. */
  unlogged: number;
  nightsLogged: number;
}

export interface Attention {
  rosterSize: number;
  onTrack: number;
  /** Flagged athletes only, red before amber, roster order within a colour. */
  exceptions: AttentionEntry[];
}

export async function loadAttention(athletes: RosterAthlete[], today: DateKey = todayKey()): Promise<Attention> {
  const windowStart = addDays(today, -STATUS_WINDOW_DAYS);
  const logs = await prisma.sleepLog.findMany({
    where: {
      userId: { in: athletes.map((a) => a.userId) },
      date: { gte: toUtc(windowStart), lt: toUtc(today) },
    },
    select: { userId: true, date: true, actualSleepHours: true, targetSleepHours: true, needsReview: true },
    orderBy: { date: "asc" },
  });
  const byUser = groupBy(logs, (l) => l.userId);

  let onTrack = 0;
  const exceptions: AttentionEntry[] = [];
  for (const member of athletes) {
    const rows = byUser.get(member.userId) ?? [];
    const nights = rows.map((l) => ({
      date: toKey(l.date),
      actualSleepHours: l.actualSleepHours,
      targetSleepHours: l.targetSleepHours,
      needsReview: l.needsReview,
    }));
    const status = deriveAthleteStatus(nights, STATUS_WINDOW_DAYS);
    if (!status.flagged) {
      onTrack++;
      continue;
    }
    exceptions.push({
      ...status,
      membershipId: member.membershipId,
      name: member.name,
      shortDays: nights.filter(isShortNight).map((n) => weekdayName(n.date)),
      unlogged: Math.max(0, STATUS_WINDOW_DAYS - nights.length),
      nightsLogged: nights.filter((n) => !n.needsReview && n.actualSleepHours != null).length,
    });
  }
  exceptions.sort((a, b) => (a.color === b.color ? 0 : a.color === "red" ? -1 : 1));

  return { rosterSize: athletes.length, onTrack, exceptions };
}

// ── the next meet ───────────────────────────────────────────────────────────

export type MeetReadinessWithId = MeetReadiness & { meet: MeetReadiness["meet"] & { id: string } };

export async function loadMeetReadiness(
  teamId: string,
  athletes: RosterAthlete[],
  today: DateKey = todayKey(),
): Promise<MeetReadinessWithId | null> {
  const todayStart = toUtc(today);
  const meet = await prisma.teamMeet.findFirst({
    where: { teamId, date: { gte: todayStart } },
    orderBy: { date: "asc" },
    select: { id: true, name: true, date: true, distances: true },
  });
  if (!meet) return null;

  const [logs, hardSessions] = await Promise.all([
    prisma.sleepLog.findMany({
      where: {
        userId: { in: athletes.map((a) => a.userId) },
        date: { gte: toUtc(addDays(today, -(RAMP_DAYS + STATUS_WINDOW_DAYS))), lt: todayStart },
      },
      select: {
        userId: true,
        date: true,
        actualSleepHours: true,
        targetSleepHours: true,
        hitTarget: true,
        needsReview: true,
      },
      orderBy: { date: "asc" },
    }),
    prisma.plannedSession.findMany({
      where: { teamId, date: { gte: todayStart, lt: meet.date } },
      select: { date: true, sessionType: true },
    }),
  ]);
  const byUser = groupBy(logs, (l) => l.userId);

  const readiness = deriveMeetReadiness({
    meet: { name: meet.name, date: toKey(meet.date), distances: meet.distances },
    today,
    athletes: athletes.map((a) => ({
      name: a.name,
      joinedOn: toKey(a.joinedAt),
      nights: (byUser.get(a.userId) ?? []).map((l) => ({
        date: toKey(l.date),
        actualSleepHours: l.actualSleepHours,
        targetSleepHours: l.targetSleepHours,
        hitTarget: l.hitTarget,
        needsReview: l.needsReview,
      })),
    })),
    hardSessionDates: hardSessions.filter((s) => isHardWorkout(s.sessionType)).map((s) => toKey(s.date)),
  });

  return { ...readiness, meet: { id: meet.id, ...readiness.meet } };
}

// ── session forecasts ───────────────────────────────────────────────────────

export interface SessionRow {
  id: string;
  date: Date;
  sessionType: string;
}

/**
 * Forecasts for the sessions given. Counts only, no names: the same week of
 * sleep the exception list reads, scored per athlete and summed.
 */
export async function loadSessionForecasts(
  teamId: string,
  athletes: RosterAthlete[],
  sessions: SessionRow[],
  today: DateKey = todayKey(),
): Promise<SessionForecast[]> {
  const todayStart = toUtc(today);
  const [logs, meet] = await Promise.all([
    prisma.sleepLog.findMany({
      where: {
        userId: { in: athletes.map((a) => a.userId) },
        date: { gte: toUtc(addDays(today, -STATUS_WINDOW_DAYS)), lt: todayStart },
      },
      select: {
        userId: true,
        date: true,
        actualSleepHours: true,
        targetSleepHours: true,
        hitTarget: true,
        recommendedBedtime: true,
        actualBedtime: true,
        needsReview: true,
      },
      orderBy: { date: "asc" },
    }),
    prisma.teamMeet.findFirst({
      where: { teamId, date: { gte: todayStart } },
      orderBy: { date: "asc" },
      select: { date: true },
    }),
  ]);
  const byUser = groupBy(logs, (l) => l.userId);

  const forForecast: AthleteForForecast[] = athletes.map((a) => {
    const rows = byUser.get(a.userId) ?? [];
    const nights = rows.map((l) => ({
      date: toKey(l.date),
      actualSleepHours: l.actualSleepHours,
      targetSleepHours: l.targetSleepHours,
      needsReview: l.needsReview,
    }));
    return {
      name: a.name,
      color: deriveAthleteStatus(nights, STATUS_WINDOW_DAYS).color,
      // Same exclusion the verdict applies: a flagged night has no duration
      // that can be trusted, and debt subtracts durations.
      sleepDebtMinutes: computeSleepDebtMinutes(rows.filter((l) => !l.needsReview)),
      nightsLogged: nights.filter((n) => !n.needsReview && n.actualSleepHours != null).length,
    };
  });

  const forSessions = sessions.map((s) => ({ id: s.id, date: toKey(s.date), sessionType: s.sessionType }));
  return forecastSessions(forSessions, forForecast, {
    today,
    sessions: forSessions,
    meetDate: meet ? toKey(meet.date) : null,
  });
}

/** The team's sessions from a week back, in date order. */
export function loadSessions(teamId: string, today: DateKey = todayKey()) {
  return prisma.plannedSession.findMany({
    where: { teamId, date: { gte: toUtc(addDays(today, -7)) } },
    orderBy: { date: "asc" },
    select: {
      id: true,
      date: true,
      sessionType: true,
      durationMinutes: true,
      description: true,
      targetPaces: true,
    },
  });
}

// ── the team trend ──────────────────────────────────────────────────────────

export async function loadTeamTrend(
  teamId: string,
  athletes: RosterAthlete[],
  today: DateKey = todayKey(),
): Promise<TeamTrend> {
  const from = toUtc(addDays(weekStartOf(today), -7 * (DEFAULT_WEEKS - 1)));
  const [logs, sessions] = await Promise.all([
    prisma.sleepLog.findMany({
      where: { userId: { in: athletes.map((a) => a.userId) }, date: { gte: from, lt: toUtc(today) } },
      select: {
        userId: true,
        date: true,
        actualSleepHours: true,
        targetSleepHours: true,
        hitTarget: true,
        needsReview: true,
      },
    }),
    prisma.plannedSession.findMany({
      where: { teamId, date: { gte: from, lt: toUtc(addDays(today, 7)) } },
      select: { date: true, sessionType: true },
    }),
  ]);

  return buildTeamTrend({
    members: athletes.map((a) => ({ userId: a.userId, name: a.name, joinedOn: toKey(a.joinedAt) })),
    nights: logs.map((l) => ({
      userId: l.userId,
      date: toKey(l.date),
      actualSleepHours: l.actualSleepHours,
      targetSleepHours: l.targetSleepHours,
      hitTarget: l.hitTarget,
      needsReview: l.needsReview,
    })),
    hardSessionDates: sessions.filter((s) => isHardWorkout(s.sessionType)).map((s) => toKey(s.date)),
    today,
  });
}

// ── helpers ─────────────────────────────────────────────────────────────────

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    const list = map.get(k);
    if (list) list.push(row);
    else map.set(k, [row]);
  }
  return map;
}
