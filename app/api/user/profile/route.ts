import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true, name: true, email: true, age: true, biologicalSex: true,
      weeklyMileage: true, experienceLevel: true, currentWakeTime: true,
      currentBedTime: true, restedFeeling: true, notifPhase1: true,
      notifPhase2: true, notifPhase3: true, notifPhase4: true, sport: true,
      planAggressiveness: true, bedtimeAdjustmentMinutes: true,
    },
  });
  return NextResponse.json(user);
}

export async function PUT(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id;

  const body = await req.json();

  const data: any = {
    name: body.name,
    age: body.age,
    biologicalSex: body.biologicalSex,
    weeklyMileage: body.weeklyMileage,
    experienceLevel: body.experienceLevel,
    currentWakeTime: body.currentWakeTime,
    currentBedTime: body.currentBedTime,
    restedFeeling: body.restedFeeling,
    notifPhase1: body.notifPhase1,
    notifPhase2: body.notifPhase2,
    notifPhase3: body.notifPhase3,
    notifPhase4: body.notifPhase4,
    sport: body.sport,
  };

  if (body.planAggressiveness !== undefined) {
    data.planAggressiveness = Math.min(100, Math.max(50, body.planAggressiveness));
  }
  if (body.bedtimeAdjustmentMinutes !== undefined) {
    data.bedtimeAdjustmentMinutes = Math.min(45, Math.max(-45, body.bedtimeAdjustmentMinutes));
  }

  await prisma.user.update({ where: { id: userId }, data });
  return NextResponse.json({ ok: true });
}
