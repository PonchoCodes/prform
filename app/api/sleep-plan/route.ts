import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateSleepPlan } from "@/lib/sleepAlgorithm";
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
  const endDate = new Date(today);
  endDate.setDate(today.getDate() + 13);

  const [{ workouts, conflicts }, meets] = await Promise.all([
    getWorkoutsForDateRange(userId, today, endDate),
    prisma.meet.findMany({ where: { userId }, orderBy: { date: "asc" } }),
  ]);

  const plan = calculateSleepPlan(
    {
      age: user.age ?? 25,
      biologicalSex: user.biologicalSex ?? "male",
      currentWakeTime: user.currentWakeTime ?? "06:00",
      currentBedTime: user.currentBedTime ?? "22:00",
      sport: user.sport ?? "track",
    },
    meets.map((m) => ({
      date: m.date,
      priority: m.priority as "A" | "B" | "C",
      name: m.name,
      raceTime: m.raceTime ?? null,
    })),
    workouts,
  );

  return NextResponse.json({ plan, user, meets, conflicts });
}
