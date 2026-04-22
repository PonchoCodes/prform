import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as any).id;
  const body = await req.json();
  const { age, biologicalSex, weeklyMileage, experienceLevel, currentWakeTime, currentBedTime, restedFeeling, weekTemplate, meets, sport } = body;

  await prisma.user.update({
    where: { id: userId },
    data: {
      age,
      biologicalSex,
      weeklyMileage,
      experienceLevel,
      currentWakeTime,
      currentBedTime,
      restedFeeling,
      onboardingDone: true,
      sport,
    },
  });

  // Delete existing template workouts
  await prisma.workout.deleteMany({ where: { userId, isTemplate: true } });

  // Create week template workouts
  if (weekTemplate) {
    const workoutData = Object.entries(weekTemplate).map(([day, w]: [string, any]) => ({
      userId,
      date: new Date(0), // placeholder for templates
      type: w.type,
      distance: w.distance ? parseFloat(w.distance) : null,
      isTemplate: true,
      dayOfWeek: parseInt(day),
    }));
    await prisma.workout.createMany({ data: workoutData });
  }

  // Delete existing meets and create new ones
  await prisma.meet.deleteMany({ where: { userId } });
  if (meets?.length) {
    await prisma.meet.createMany({
      data: meets.map((m: any) => ({
        userId,
        name: m.name,
        date: new Date(m.date),
        distances: m.distances,
        priority: m.priority,
        raceTime: m.raceTime || null,
      })),
    });
  }

  return NextResponse.json({ ok: true });
}
