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
  const {
    date,
    hitTarget,
    actualBedtime,
    actualWakeTime,
    recommendedBedtime,
    recommendedWakeTime,
    targetSleepHours,
  } = body;

  if (!date || !recommendedBedtime || hitTarget === undefined) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  if (hitTarget === false && !actualBedtime) {
    return NextResponse.json({ error: "actualBedtime required when hitTarget is false" }, { status: 400 });
  }

  // The plan is recomputed on every request, so the night's target has to be
  // frozen here or the trend chart later compares actuals against a target
  // that has since moved. Optional so an older client still logs successfully.
  const targetWake = typeof recommendedWakeTime === "string" ? recommendedWakeTime : null;
  const targetHours =
    typeof targetSleepHours === "number" && Number.isFinite(targetSleepHours)
      ? targetSleepHours
      : null;

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
      recommendedWakeTime: targetWake,
      targetSleepHours: targetHours,
      hitTarget,
      actualBedtime: resolvedActualBedtime,
      actualWakeTime: actualWakeTime ?? null,
      actualSleepHours: Math.round(actualSleepHours * 100) / 100,
      // A web log is the athlete recalling a clock time after the fact, not a
      // timestamp we observed. MANUAL is reserved for exactly this route.
      source: "MANUAL",
    },
    update: {
      // The pre-enum version of this route set `source` on create only, so
      // re-logging a night left it stale. It is now written on both branches.
      source: "MANUAL",
      recommendedBedtime,
      // Never overwrite a stored target with null — a re-log from a client that
      // did not send one must not erase the night's original target.
      ...(targetWake ? { recommendedWakeTime: targetWake } : {}),
      ...(targetHours != null ? { targetSleepHours: targetHours } : {}),
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
