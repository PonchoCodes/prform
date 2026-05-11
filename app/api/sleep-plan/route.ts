import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateSleepPlan } from "@/lib/sleepAlgorithm";
import type { SleepLogForPlan } from "@/lib/sleepAlgorithm";
import { getWorkoutsForDateRange } from "@/lib/workoutDataSource";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as any).id;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.onboardingDone) {
    return NextResponse.json({ redirect: "/onboarding" }, { status: 200 });
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const endDate = new Date(today);
  endDate.setDate(today.getDate() + 13);

  const [{ workouts, conflicts }, meets, sleepLogs] = await Promise.all([
    getWorkoutsForDateRange(userId, yesterday, endDate),
    prisma.meet.findMany({ where: { userId }, orderBy: { date: "asc" } }),
    prisma.sleepLog.findMany({
      where: { userId, date: { gte: yesterday, lte: endDate } },
      orderBy: { date: "asc" },
    }),
  ]);

  const sleepLogsForPlan: SleepLogForPlan[] = sleepLogs.map((l) => ({
    date: new Date(l.date).toISOString().slice(0, 10),
    hitTarget: l.hitTarget,
    actualBedtime: l.actualBedtime,
    actualSleepHours: l.actualSleepHours,
  }));

  // Full plan: yesterday (offset -1) through today+13, 15 entries
  const allPlans = calculateSleepPlan(
    {
      age: user.age ?? 25,
      biologicalSex: user.biologicalSex ?? "male",
      currentWakeTime: user.currentWakeTime ?? "06:00",
      currentBedTime: user.currentBedTime ?? "22:00",
      sport: user.sport ?? "track",
      planAggressiveness: user.planAggressiveness ?? 85,
      bedtimeAdjustmentMinutes: user.bedtimeAdjustmentMinutes ?? 0,
    },
    meets.map((m) => ({
      date: m.date,
      priority: m.priority as "A" | "B" | "C",
      name: m.name,
      raceTime: m.raceTime ?? null,
    })),
    workouts,
    undefined,
    { startDayOffset: -1, sleepLogs: sleepLogsForPlan },
  );

  const yesterdayPlan = allPlans[0];  // dayOffset = -1
  const plan = allPlans.slice(1);     // dayOffset 0..13

  return NextResponse.json({
    plan,
    user,
    meets,
    conflicts,
    yesterdayPlan,
  });
}
