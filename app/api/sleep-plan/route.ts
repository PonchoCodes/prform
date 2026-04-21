import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateSleepPlan } from "@/lib/sleepAlgorithm";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as any).id;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.onboardingDone) {
    return NextResponse.json({ redirect: "/onboarding" }, { status: 200 });
  }

  const templateWorkouts = await prisma.workout.findMany({
    where: { userId, isTemplate: true },
  });

  const oneOffWorkouts = await prisma.workout.findMany({
    where: { userId, isTemplate: false },
    orderBy: { date: "asc" },
  });

  const meets = await prisma.meet.findMany({
    where: { userId },
    orderBy: { date: "asc" },
  });

  // Build daily workouts from template + one-offs for next 14 days
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const workouts = [];
  for (let i = 0; i < 14; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    date.setHours(0, 0, 0, 0);

    const dow = (date.getDay() + 6) % 7; // 0=Mon

    const oneOff = oneOffWorkouts.find((w) => {
      const d = new Date(w.date);
      d.setHours(0, 0, 0, 0);
      return d.getTime() === date.getTime();
    });

    if (oneOff) {
      workouts.push({ date, type: oneOff.type as any });
    } else {
      const template = templateWorkouts.find((w) => w.dayOfWeek === dow);
      if (template) {
        workouts.push({ date, type: template.type as any });
      }
    }
  }

  const plan = calculateSleepPlan(
    {
      age: user.age ?? 25,
      biologicalSex: user.biologicalSex ?? "male",
      currentWakeTime: user.currentWakeTime ?? "06:00",
      currentBedTime: user.currentBedTime ?? "22:00",
      sport: user.sport ?? "track",
    },
    workouts,
    meets.map((m) => ({
      date: m.date,
      priority: m.priority as "A" | "B" | "C",
      name: m.name,
    }))
  );

  return NextResponse.json({ plan, user, meets, templateWorkouts, oneOffWorkouts });
}
