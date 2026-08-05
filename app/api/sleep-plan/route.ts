import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateSleepPlan } from "@/lib/sleepAlgorithm";
import type { SleepLogForPlan } from "@/lib/sleepAlgorithm";
import { getWorkoutsForDateRange } from "@/lib/workoutDataSource";
import { calculatePerformancePrediction } from "@/lib/performancePrediction";
import { toClientUser, CLIENT_USER_SELECT } from "@/lib/clientUser";

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

  const [{ workouts, conflicts }, meets, sleepLogs, recentSleepLogs] = await Promise.all([
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
  ]);

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
    undefined,
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
  });
}
