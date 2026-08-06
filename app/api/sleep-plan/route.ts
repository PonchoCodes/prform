import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateSleepPlan } from "@/lib/sleepAlgorithm";
import type { SleepLogForPlan } from "@/lib/sleepAlgorithm";
import { getWorkoutsForDateRange } from "@/lib/workoutDataSource";
import { calculatePerformancePrediction } from "@/lib/performancePrediction";
import { toClientUser, CLIENT_USER_SELECT } from "@/lib/clientUser";
import { calculatePMC, calculateVDOT, type StravaActivityInput } from "@/lib/performanceAnalysis";
import { resolvePaces } from "@/lib/paceSource";
import { computeSleepDebtMinutes } from "@/lib/verdict";

/**
 * PMC needs the 90-day window plus its 42-day warm-up; 200 days covers that
 * with room to spare while keeping the dashboard's main query bounded.
 */
const ACTIVITY_HISTORY_DAYS = 200;
/** The window the dashboard verdict describes as "this week". */
const DEBT_WINDOW_DAYS = 7;

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as any).id;

  // Explicit select — the User row holds the bcrypt password, live Strava
  // OAuth tokens and Stripe identifiers, none of which may leave the server.
  // Covers what the sleep plan needs internally plus what the client is
  // allowed to see; the response itself is narrowed again by `toClientUser`.
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      onboardingDone: true,
      age: true,
      biologicalSex: true,
      currentWakeTime: true,
      currentBedTime: true,
      sport: true,
      planAggressiveness: true,
      bedtimeAdjustmentMinutes: true,
      // Needed to resolve the pace table and the training-stress balance the
      // dashboard verdict is built from.
      userMaxHR: true,
      userThresholdHR: true,
      stravaConnected: true,
      prTimeSeconds: true,
      prRecency: true,
      prSetOn: true,
      ...CLIENT_USER_SELECT,
    },
  });
  if (!user || !user.onboardingDone) {
    return NextResponse.json({ redirect: "/onboarding" }, { status: 200 });
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const endDate = new Date(today);
  endDate.setDate(today.getDate() + 13);

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const debtWindowStart = new Date(today);
  debtWindowStart.setDate(today.getDate() - DEBT_WINDOW_DAYS);

  const activityHistoryStart = new Date(today);
  activityHistoryStart.setDate(today.getDate() - ACTIVITY_HISTORY_DAYS);

  const [{ workouts, conflicts }, meets, sleepLogs, recentSleepLogs, debtLogs, activities] =
    await Promise.all([
      getWorkoutsForDateRange(userId, yesterday, endDate),
      prisma.meet.findMany({ where: { userId }, orderBy: { date: "asc" } }),
      prisma.sleepLog.findMany({
        where: { userId, date: { gte: yesterday, lte: endDate } },
        orderBy: { date: "asc" },
      }),
      prisma.sleepLog.findMany({
        where: { userId, date: { gte: sevenDaysAgo } },
        orderBy: { date: "desc" },
        take: 3,
      }),
      prisma.sleepLog.findMany({
        where: { userId, date: { gte: debtWindowStart, lt: today } },
        orderBy: { date: "desc" },
      }),
      prisma.stravaActivity.findMany({
        where: { userId, startDate: { gte: activityHistoryStart } },
        orderBy: { startDate: "desc" },
      }),
    ]);

  // The verdict has to name a pace, so the paces have to arrive with the plan
  // rather than a tab-click later. Same resolution order as analyzePerformance:
  // observed VDOT, blended against the declared PR, then everything that keys
  // off the resulting threshold pace.
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

  // No activities means no meaningful stress balance — null, so the verdict
  // says nothing about form rather than reporting a confident zero.
  const tsb =
    activityInputs.length > 0
      ? calculatePMC(activityInputs, user, resolved.paces?.thresholdPaceMs ?? 3.5).currentTSB
      : null;

  const sleepDebtMinutes = computeSleepDebtMinutes(debtLogs);

  const sleepLogsForPlan: SleepLogForPlan[] = sleepLogs.map((l) => ({
    date: new Date(l.date).toISOString().slice(0, 10),
    hitTarget: l.hitTarget,
    actualBedtime: l.actualBedtime,
    actualSleepHours: l.actualSleepHours,
    recommendedBedtime: l.recommendedBedtime,
  }));

  const recentSleepLogsForPlan: SleepLogForPlan[] = recentSleepLogs.map((l) => ({
    date: new Date(l.date).toISOString().slice(0, 10),
    hitTarget: l.hitTarget,
    actualBedtime: l.actualBedtime,
    actualSleepHours: l.actualSleepHours,
    recommendedBedtime: l.recommendedBedtime,
  }));

  const meetsForPlan = meets.map((m) => ({
    date: m.date,
    priority: m.priority as "A" | "B" | "C",
    name: m.name,
    raceTime: m.raceTime ?? null,
  }));

  const allPlans = calculateSleepPlan(
    {
      age: user.age ?? 25,
      biologicalSex: user.biologicalSex ?? "male",
      currentWakeTime: user.currentWakeTime ?? "06:00",
      currentBedTime: user.currentBedTime ?? "22:00",
      planAggressiveness: user.planAggressiveness ?? 85,
      bedtimeAdjustmentMinutes: user.bedtimeAdjustmentMinutes ?? 0,
    },
    meetsForPlan,
    workouts,
    // The algorithm has always accepted a TSB for its pre-race fatigue boost;
    // until now nothing computed one to pass.
    tsb ?? undefined,
    { startDayOffset: -1, sleepLogs: sleepLogsForPlan, recentSleepLogs: recentSleepLogsForPlan },
  );

  const yesterdayPlan = allPlans[0];
  const plan = allPlans.slice(1);

  // Compute performance predictions for upcoming meets with event/time data
  const upcomingMeetsWithEvents = meets
    .filter((m) => m.primaryEvent && (m.recentBest || m.personalBest) && new Date(m.date) >= today)
    .slice(0, 3);

  let meetPredictions: Record<string, any> = {};

  if (upcomingMeetsWithEvents.length > 0) {
    const earliestWindowStart = upcomingMeetsWithEvents.reduce((earliest, m) => {
      const d = new Date(m.date);
      d.setDate(d.getDate() - 10);
      return d < earliest ? d : earliest;
    }, new Date(today));

    const predSleepLogs = await prisma.sleepLog.findMany({
      where: { userId, date: { gte: earliestWindowStart, lt: today } },
      orderBy: { date: "asc" },
    });

    const predLogsForCalc = predSleepLogs.map((l) => ({
      date: new Date(l.date).toISOString().slice(0, 10),
      hitTarget: l.hitTarget,
      actualBedtime: l.actualBedtime,
      recommendedBedtime: l.recommendedBedtime,
    }));

    for (const meet of upcomingMeetsWithEvents) {
      const prediction = calculatePerformancePrediction(
        meet,
        predLogsForCalc,
        { currentBedTime: user.currentBedTime },
      );
      if (prediction) meetPredictions[meet.id] = prediction;
    }
  }

  return NextResponse.json({
    plan,
    user: toClientUser(user),
    meets,
    conflicts,
    yesterdayPlan,
    meetPredictions,
    // Inputs to the dashboard verdict. `resolved` is a sibling of `user`, not
    // part of it — ClientUser stays an allowlist of User columns.
    resolved,
    fitness: {
      tsb,
      sleepDebtMinutes,
      nightsLogged: debtLogs.length,
      stravaConnected: user.stravaConnected,
    },
  });
}
