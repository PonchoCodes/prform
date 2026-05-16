import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateSleepPlan } from "@/lib/sleepAlgorithm";
import type { SleepLogForPlan } from "@/lib/sleepAlgorithm";
import { getWorkoutsForDateRange } from "@/lib/workoutDataSource";
import { calculatePerformancePrediction } from "@/lib/performancePrediction";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as any).id;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.onboardingDone) {
    return NextResponse.json({ redirect: "/onboarding" }, { status: 200 });
  }

  const freshUser = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      planAggressiveness: true,
      bedtimeAdjustmentMinutes: true,
      currentWakeTime: true,
      currentBedTime: true,
      age: true,
      biologicalSex: true,
      experienceLevel: true,
      weeklyMileage: true,
    },
  });

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

  const allPlans = calculateSleepPlan(
    {
      age: freshUser?.age ?? user.age ?? 25,
      biologicalSex: freshUser?.biologicalSex ?? user.biologicalSex ?? "male",
      currentWakeTime: freshUser?.currentWakeTime ?? user.currentWakeTime ?? "06:00",
      currentBedTime: freshUser?.currentBedTime ?? user.currentBedTime ?? "22:00",
      sport: user.sport ?? "track",
      planAggressiveness: freshUser?.planAggressiveness ?? user.planAggressiveness ?? 85,
      bedtimeAdjustmentMinutes: freshUser?.bedtimeAdjustmentMinutes ?? user.bedtimeAdjustmentMinutes ?? 0,
    },
    meets.map((m) => ({
      date: m.date,
      priority: m.priority as "A" | "B" | "C",
      name: m.name,
      raceTime: m.raceTime ?? null,
    })),
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
    user,
    meets,
    conflicts,
    yesterdayPlan,
    meetPredictions,
  });
}
