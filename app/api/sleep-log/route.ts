import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function parseTimeMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function computeSleepHours(bedtime: string, waketime: string): number {
  const bed = parseTimeMin(bedtime);
  const wake = parseTimeMin(waketime);
  return ((wake - bed + 1440) % 1440) / 60;
}

function dayStart(dateStr: string): Date {
  return new Date(dateStr + "T00:00:00.000Z");
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id;

  const body = await req.json();
  const { date, hitTarget, actualBedtime, actualWakeTime, recommendedBedtime } = body;

  if (!date || !recommendedBedtime || hitTarget === undefined) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  if (hitTarget === false && !actualBedtime) {
    return NextResponse.json({ error: "actualBedtime required when hitTarget is false" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { currentWakeTime: true } });
  const resolvedActualBedtime: string = hitTarget ? recommendedBedtime : actualBedtime;
  const wakeForCompute = actualWakeTime || user?.currentWakeTime || "06:00";
  const actualSleepHours = computeSleepHours(resolvedActualBedtime, wakeForCompute);

  const log = await prisma.sleepLog.upsert({
    where: { userId_date: { userId, date: dayStart(date) } },
    create: {
      userId,
      date: dayStart(date),
      recommendedBedtime,
      hitTarget,
      actualBedtime: resolvedActualBedtime,
      actualWakeTime: actualWakeTime ?? null,
      actualSleepHours: Math.round(actualSleepHours * 100) / 100,
      source: "manual",
    },
    update: {
      recommendedBedtime,
      hitTarget,
      actualBedtime: resolvedActualBedtime,
      actualWakeTime: actualWakeTime ?? null,
      actualSleepHours: Math.round(actualSleepHours * 100) / 100,
    },
  });

  return NextResponse.json(log);
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id;

  const { searchParams } = new URL(req.url);
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");

  const where: any = { userId };
  if (startDate) where.date = { ...where.date, gte: dayStart(startDate) };
  if (endDate) where.date = { ...where.date, lte: new Date(endDate + "T23:59:59.999Z") };

  const logs = await prisma.sleepLog.findMany({
    where,
    orderBy: { date: "desc" },
  });

  return NextResponse.json(logs);
}
