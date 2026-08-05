import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { aggressivenessForExperienceLevel } from "@/lib/sleepAlgorithm";
import { buildDeclaredPrUpdate } from "@/lib/paceSource";
import { prDistanceById } from "@/lib/vdot";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as any).id;
  const body = await req.json();
  const {
    age, biologicalSex, weeklyMileage, experienceLevel, currentWakeTime, currentBedTime,
    restedFeeling, weekTemplate, meets, sport, unitPreference,
    prDistanceId, prTimeSeconds, prRecency, goalRaceDistanceId,
  } = body;

  // Re-validate the declared PR server-side — the client can be bypassed, and a
  // bad PR would silently poison every prescribed pace.
  const declaredPr = buildDeclaredPrUpdate(prDistanceId, prTimeSeconds, prRecency);

  const updatedUser = await prisma.user.update({
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
      planAggressiveness: aggressivenessForExperienceLevel(experienceLevel ?? ""),
      ...(unitPreference === "imperial" || unitPreference === "metric" ? { unitPreference } : {}),
      ...(goalRaceDistanceId && prDistanceById(goalRaceDistanceId) ? { goalRaceDistanceId } : {}),
      ...declaredPr,
    },
    select: { earlyAccessUser: true },
  });

  await prisma.workout.deleteMany({ where: { userId, isTemplate: true } });

  if (weekTemplate) {
    const workoutData = Object.entries(weekTemplate).map(([day, w]: [string, any]) => ({
      userId,
      date: new Date(0),
      type: w.type,
      distance: w.distance ? parseFloat(w.distance) : null,
      isTemplate: true,
      dayOfWeek: parseInt(day),
    }));
    await prisma.workout.createMany({ data: workoutData });
  }

  await prisma.meet.deleteMany({ where: { userId } });
  if (meets?.length) {
    await prisma.meet.createMany({
      data: meets.map((m: any) => ({
        userId,
        name: m.name,
        date: new Date(m.date),
        distances: m.distances || null,
        priority: m.priority,
        raceTime: m.raceTime || null,
        primaryEvent: m.primaryEvent || null,
        personalBest: m.personalBest || null,
        personalBestUnit: m.personalBestUnit || null,
      })),
    });
  }

  return NextResponse.json({ ok: true, earlyAccessUser: updatedUser.earlyAccessUser });
}
