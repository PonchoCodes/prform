import { prisma } from "@/lib/prisma";
export type { WorkoutType, NormalizedWorkout, WorkoutConflict } from "@/lib/workoutTypes";
import type { WorkoutType, NormalizedWorkout, WorkoutConflict } from "@/lib/workoutTypes";

// ── Strava → WorkoutType classifier ──────────────────────────────────────────

const TEMPO_RE   = /tempo|threshold|t-pace|cruise/i;
const TRACK_RE   = /track|interval|repeat|speed/i;
const LONG_RE    = /long|lsd|endurance/i;
const EASY_RE    = /easy|recovery|jog|base/i;
const CROSS_RE   = /cross|bike|swim|cycle|strength|yoga|gym/i;

function stravaToWorkoutType(
  name: string,
  sufferScore: number | null | undefined,
  workoutType: number | null | undefined,
  distanceM: number,
): WorkoutType {
  if (workoutType === 1 || (sufferScore ?? 0) >= 75) return "race";
  if (TRACK_RE.test(name))  return "track";
  if (TEMPO_RE.test(name))  return "tempo";
  if (LONG_RE.test(name) || distanceM > 16000) return "long_run";
  if (CROSS_RE.test(name))  return "cross_train";
  if (EASY_RE.test(name) || (sufferScore !== null && sufferScore !== undefined && sufferScore < 30)) return "easy";
  const ss = sufferScore ?? 50;
  if (ss <= 74) return "moderate";
  return "moderate";
}

// ── TSS helpers for assumed load ─────────────────────────────────────────────

function estimateTSS(movingTimeSec: number, sufferScore: number | null): number {
  const hours = movingTimeSec / 3600;
  // Rough IF from suffer score (0-200 range → 0-1.3 IF)
  const IF = sufferScore ? Math.min(1.3, 0.5 + (sufferScore / 200) * 0.8) : 0.7;
  return hours * IF * IF * 100;
}

function assumedTypeFromAvgTSS(avgDailyTSS: number): WorkoutType {
  if (avgDailyTSS < 30) return "easy";
  if (avgDailyTSS < 50) return "moderate";
  if (avgDailyTSS < 70) return "tempo";
  return "long_run";
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Sessions the athlete's coach planned, keyed by date. The overlay that makes
 * the planned-session verdict work with no Strava and no athlete input: a
 * team session ranks below the athlete's own record of the day (Strava or a
 * manual entry — they know what they actually did) and above the weekly
 * template and the assumed filler (a coach's plan for Tuesday beats a guess
 * about Tuesdays in general).
 */
async function teamSessionsByDate(
  userId: string,
  start: Date,
  end: Date,
): Promise<Map<string, { type: WorkoutType; note?: string }>> {
  const memberships = await prisma.teamMembership.findMany({
    where: { userId, status: "ACTIVE" },
    select: { teamId: true },
  });
  if (memberships.length === 0) return new Map();

  const sessions = await prisma.plannedSession.findMany({
    where: {
      teamId: { in: memberships.map((m) => m.teamId) },
      date: { gte: start, lte: new Date(end.getTime() + 86400000) },
    },
    orderBy: { date: "asc" },
    select: { date: true, sessionType: true, description: true, targetPaces: true },
  });

  const byDate = new Map<string, { type: WorkoutType; note?: string }>();
  for (const s of sessions) {
    const key = isoDate(startOfDay(new Date(s.date)));
    // Two teams planning the same day: first team wins. Rare, and any rule
    // here is arbitrary — the athlete's coach should resolve it, not math.
    if (byDate.has(key)) continue;
    const note = [s.description, s.targetPaces].filter(Boolean).join(" — ") || undefined;
    byDate.set(key, { type: s.sessionType as WorkoutType, note });
  }
  return byDate;
}

function teamWorkout(
  date: Date,
  session: { type: WorkoutType; note?: string },
  isPast: boolean,
): NormalizedWorkout {
  return {
    date,
    type: session.type,
    distance: 0,
    // Nominal hour: the algorithm keys its load bonuses off the type; the
    // duration only has to be a plausible session, not a measurement.
    duration: 60,
    source: "team",
    isTentative: !isPast,
    note: session.note,
  };
}

export async function getWorkoutsForDateRange(
  userId: string,
  startDate: Date,
  endDate: Date,
): Promise<{ workouts: NormalizedWorkout[]; conflicts: WorkoutConflict[] }> {
  const today = startOfDay(new Date());
  const start = startOfDay(startDate);
  const end = startOfDay(endDate);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { stravaConnected: true },
  });

  const teamByDate = await teamSessionsByDate(userId, start, end);

  const conflicts: WorkoutConflict[] = [];
  const result: NormalizedWorkout[] = [];

  // Build a date list
  const dates: Date[] = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(startOfDay(new Date(d)));
  }

  // ── STRAVA USER PATH ──────────────────────────────────────────────────────
  if (user?.stravaConnected) {
    // Fetch all Strava activities in range
    const stravaActivities = await prisma.stravaActivity.findMany({
      where: {
        userId,
        startDate: { gte: start, lte: new Date(end.getTime() + 86400000) },
      },
    });

    // Fetch all manual workouts in range (non-template)
    const manualWorkouts = await prisma.workout.findMany({
      where: {
        userId,
        isTemplate: false,
        date: { gte: start, lte: new Date(end.getTime() + 86400000) },
      },
    });

    // Map by date string
    const stravaByDate = new Map<string, typeof stravaActivities[0]>();
    for (const act of stravaActivities) {
      const key = isoDate(startOfDay(new Date(act.startDate)));
      if (!stravaByDate.has(key)) stravaByDate.set(key, act);
    }

    const manualByDate = new Map<string, typeof manualWorkouts[0]>();
    for (const w of manualWorkouts) {
      const key = isoDate(startOfDay(new Date(w.date)));
      if (!manualByDate.has(key)) manualByDate.set(key, w);
    }

    // Compute rolling 7-day avg TSS from recent Strava for assumed future
    const recentCutoff = new Date(today);
    recentCutoff.setDate(today.getDate() - 7);
    const recentActivities = await prisma.stravaActivity.findMany({
      where: { userId, startDate: { gte: recentCutoff, lte: today } },
      select: { movingTime: true, sufferScore: true },
    });
    const totalTSS = recentActivities.reduce((s, a) => s + estimateTSS(a.movingTime, a.sufferScore), 0);
    const daysWithData = Math.max(1, recentActivities.length);
    const avgDailyTSS = totalTSS / Math.min(7, daysWithData);

    for (const date of dates) {
      const key = isoDate(date);
      const isPast = date <= today;
      const stravaAct = stravaByDate.get(key);
      const manualW = manualByDate.get(key);

      if (isPast) {
        // Detect conflict
        if (stravaAct && manualW && !manualW.conflictDismissed) {
          conflicts.push({
            workoutId: manualW.id,
            date: key,
            stravaName: stravaAct.name,
            manualType: manualW.type,
            conflictDismissed: manualW.conflictDismissed,
          });
        }

        // Decide source
        const useManual = manualW && manualW.manualOverride;
        if (useManual) {
          result.push({
            id: manualW.id,
            date,
            type: manualW.type as WorkoutType,
            distance: (manualW.distance ?? 0) * 1.60934, // miles → km
            duration: manualW.duration ?? 0,
            effort: manualW.effort,
            quality: manualW.quality,
            source: "manual",
            isTentative: false,
            manualOverride: true,
          });
        } else if (stravaAct) {
          result.push({
            date,
            type: stravaToWorkoutType(
              stravaAct.name,
              stravaAct.sufferScore,
              stravaAct.workoutType,
              stravaAct.distance,
            ),
            distance: stravaAct.distance / 1000,
            duration: Math.round(stravaAct.movingTime / 60),
            averageHeartRate: stravaAct.averageHeartrate ?? undefined,
            source: "strava",
            isTentative: false,
            stravaActivityId: stravaAct.stravaId,
          });
        } else if (manualW) {
          // No Strava record that day: the manual log IS the day's record.
          // This branch was missing — a logged treadmill run on a watchless
          // day silently vanished from the plan despite the documented
          // "fall back to manual one-offs" contract.
          result.push({
            id: manualW.id,
            date,
            type: manualW.type as WorkoutType,
            distance: (manualW.distance ?? 0) * 1.60934,
            duration: manualW.duration ?? 0,
            effort: manualW.effort,
            quality: manualW.quality,
            source: "manual",
            isTentative: false,
          });
        } else {
          const teamSession = teamByDate.get(key);
          if (teamSession) result.push(teamWorkout(date, teamSession, true));
          // Otherwise: no entry (treated as rest by algorithm)
        }
      } else {
        // FUTURE DATE
        const teamSession = teamByDate.get(key);
        if (manualW) {
          result.push({
            id: manualW.id,
            date,
            type: manualW.type as WorkoutType,
            distance: (manualW.distance ?? 0) * 1.60934,
            duration: manualW.duration ?? 0,
            effort: manualW.effort,
            quality: manualW.quality,
            source: "manual",
            isTentative: true,
          });
        } else if (teamSession) {
          result.push(teamWorkout(date, teamSession, false));
        } else {
          // Assumed from rolling load
          result.push({
            date,
            type: assumedTypeFromAvgTSS(avgDailyTSS),
            distance: 6,
            duration: 45,
            source: "assumed",
            isTentative: true,
          });
        }
      }
    }
  }
  // ── MANUAL USER PATH ──────────────────────────────────────────────────────
  else {
    const templateWorkouts = await prisma.workout.findMany({
      where: { userId, isTemplate: true },
    });

    const oneOffWorkouts = await prisma.workout.findMany({
      where: {
        userId,
        isTemplate: false,
        date: { gte: start, lte: new Date(end.getTime() + 86400000) },
      },
    });

    const oneOffByDate = new Map<string, typeof oneOffWorkouts[0]>();
    for (const w of oneOffWorkouts) {
      oneOffByDate.set(isoDate(startOfDay(new Date(w.date))), w);
    }

    // Average type from existing manual entries for assumed future
    const allManual = await prisma.workout.findMany({
      where: { userId, isTemplate: false },
      select: { type: true },
      take: 30,
      orderBy: { date: "desc" },
    });
    const typeFreq: Record<string, number> = {};
    for (const w of allManual) { typeFreq[w.type] = (typeFreq[w.type] ?? 0) + 1; }
    const dominantType = (Object.entries(typeFreq).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "easy") as WorkoutType;

    for (const date of dates) {
      const key = isoDate(date);
      const isPast = date <= today;
      const oneOff = oneOffByDate.get(key);

      const teamSession = teamByDate.get(key);

      if (oneOff) {
        result.push({
          id: oneOff.id,
          date,
          type: oneOff.type as WorkoutType,
          distance: (oneOff.distance ?? 0) * 1.60934,
          duration: oneOff.duration ?? 0,
          effort: oneOff.effort,
          quality: oneOff.quality,
          source: "manual",
          isTentative: oneOff.isTentative || !isPast,
        });
      } else if (teamSession) {
        // The coach's plan for a specific date beats the weekly template —
        // it knows about Tuesday, not Tuesdays.
        result.push(teamWorkout(date, teamSession, isPast));
      } else {
        // Try template
        const dow = (date.getDay() + 6) % 7; // 0=Mon
        const template = templateWorkouts.find((t) => t.dayOfWeek === dow);
        if (template) {
          result.push({
            date,
            type: template.type as WorkoutType,
            distance: (template.distance ?? 0) * 1.60934,
            duration: 45,
            source: "manual",
            isTentative: !isPast,
          });
        } else if (!isPast) {
          result.push({
            date,
            type: dominantType === "rest" ? "easy" : dominantType,
            distance: 5,
            duration: 40,
            source: "assumed",
            isTentative: true,
          });
        }
      }
    }
  }

  return { workouts: result, conflicts };
}
