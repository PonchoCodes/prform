// The verdict for one athlete, assembled outside a request.
//
// The dashboard builds its VerdictInput in the browser from what
// /api/sleep-plan returns. The morning text has no browser and no session, so
// it assembles the same input here from the same sources — the resolved pace
// table, the training-stress balance, the recent sleep record and the plan day.
//
// Deliberately one function calling `computeVerdict` rather than a second
// ladder: the athlete must not be told one thing by the app and another by a
// text sent the same morning.

import { prisma } from "@/lib/prisma";
import { computeVerdict, computeSleepDebtMinutes, type Verdict } from "@/lib/verdict";
import { resolvePaces } from "@/lib/paceSource";
import { calculatePMC, calculateVDOT, type StravaActivityInput } from "@/lib/performanceAnalysis";
import type { DailySleepPlan } from "@/lib/sleepAlgorithm";
import type { UnitPreference } from "@/lib/unitUtils";

/** Matches /api/sleep-plan, so the two cannot drift. */
const ACTIVITY_HISTORY_DAYS = 200;
const DEBT_WINDOW_DAYS = 7;

export const VERDICT_USER_SELECT = {
  id: true,
  unitPreference: true,
  stravaConnected: true,
  userMaxHR: true,
  userThresholdHR: true,
  prDistanceId: true,
  prTimeSeconds: true,
  prRecency: true,
  prSetOn: true,
} as const;

export type VerdictUser = {
  id: string;
  unitPreference: string;
  stravaConnected: boolean;
  userMaxHR: number | null;
  userThresholdHR: number | null;
  prDistanceId: string | null;
  prTimeSeconds: number | null;
  prRecency: string | null;
  prSetOn: Date | null;
};

/**
 * The verdict for the morning that follows `plan`.
 *
 * `todayPlan` is the night being scheduled; `tomorrowPlan` only changes why a
 * day is easy, never whether it is, and is optional for that reason.
 */
export async function verdictForUser(
  user: VerdictUser,
  todayPlan: DailySleepPlan,
  tomorrowPlan?: DailySleepPlan,
): Promise<Verdict> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const activityHistoryStart = new Date(today);
  activityHistoryStart.setDate(today.getDate() - ACTIVITY_HISTORY_DAYS);
  const debtWindowStart = new Date(today);
  debtWindowStart.setDate(today.getDate() - DEBT_WINDOW_DAYS);

  const [activities, debtLogs] = await Promise.all([
    prisma.stravaActivity.findMany({
      where: { userId: user.id, startDate: { gte: activityHistoryStart } },
      orderBy: { startDate: "desc" },
    }),
    prisma.sleepLog.findMany({
      // Flagged nights carry no trustworthy duration, and the debt calculation
      // subtracts durations. Same exclusion the trend chart applies.
      where: {
        userId: user.id,
        date: { gte: debtWindowStart, lt: today },
        needsReview: false,
      },
      orderBy: { date: "desc" },
    }),
  ]);

  const activityInputs: StravaActivityInput[] = activities.map((a) => ({
    stravaId: a.stravaId,
    name: a.name,
    startDate: a.startDate,
    distance: a.distance,
    movingTime: a.movingTime,
    elapsedTime: a.elapsedTime,
    totalElevGain: a.totalElevGain,
    averageSpeed: a.averageSpeed,
    maxSpeed: a.maxSpeed,
    averageHeartrate: a.averageHeartrate,
    maxHeartrate: a.maxHeartrate,
    sufferScore: a.sufferScore,
    workoutType: a.workoutType,
    averageCadence: a.averageCadence,
    externalId: a.externalId,
  }));

  const observed = calculateVDOT(activityInputs);
  const resolved = resolvePaces(user, {
    vdot: observed.vdot,
    qualifyingEfforts: observed.qualifyingEfforts,
  });

  const tsb =
    activityInputs.length > 0
      ? calculatePMC(activityInputs, user, resolved.paces?.thresholdPaceMs ?? 3.5).currentTSB
      : null;

  return computeVerdict({
    paces: resolved.paces,
    paceSourceKind: resolved.source.kind,
    unit: (user.unitPreference ?? "imperial") as UnitPreference,
    stravaConnected: user.stravaConnected,
    totalSleepHours: todayPlan.totalSleepHours,
    sleepShortfallMinutes: todayPlan.sleepShortfallMinutes,
    achievableSleepHours: todayPlan.achievableSleepHours,
    recoveryScore: todayPlan.recoveryScore,
    trainingLoadLevel: todayPlan.trainingLoadLevel,
    tomorrowLoadLevel: tomorrowPlan?.trainingLoadLevel ?? null,
    daysUntilNextMeet: todayPlan.daysUntilNextMeet,
    nextMeetName: todayPlan.nextMeetName,
    nextMeetPriority: todayPlan.nextMeetPriority,
    tsb,
    sleepDebtMinutes: computeSleepDebtMinutes(debtLogs),
    nightsLogged: debtLogs.length,
  });
}
