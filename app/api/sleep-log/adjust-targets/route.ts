import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function parseTimeMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function minutesToTime(minutes: number): string {
  const total = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { currentBedTime: true, bedtimeAdjustmentMinutes: true },
  });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Compute average lateness from last 7 misses
  const misses = await prisma.sleepLog.findMany({
    where: { userId, hitTarget: false, actualBedtime: { not: null } },
    orderBy: { date: "desc" },
    take: 7,
  });

  if (misses.length === 0) {
    return NextResponse.json({ error: "No missed nights to average" }, { status: 400 });
  }

  let totalDev = 0;
  for (const m of misses) {
    const actual = parseTimeMin(m.actualBedtime!);
    const rec = parseTimeMin(m.recommendedBedtime);
    let dev = actual - rec;
    if (dev > 720) dev -= 1440;
    if (dev < -720) dev += 1440;
    totalDev += dev;
  }

  const rawAdj = totalDev / misses.length;
  // Round to nearest 5 minutes
  let newAdjustment = Math.round(rawAdj / 5) * 5;
  const capped = newAdjustment > 45;
  newAdjustment = Math.min(45, Math.max(-45, newAdjustment));

  const oldAdjustment = user.bedtimeAdjustmentMinutes ?? 0;

  await prisma.user.update({
    where: { id: userId },
    data: { bedtimeAdjustmentMinutes: newAdjustment },
  });

  const baseBedtime = user.currentBedTime ?? "22:30";
  const baseBedMin = parseTimeMin(baseBedtime);

  return NextResponse.json({
    oldAdjustmentMinutes: oldAdjustment,
    newAdjustmentMinutes: newAdjustment,
    oldTargetApprox: minutesToTime(baseBedMin + oldAdjustment),
    newTargetApprox: minutesToTime(baseBedMin + newAdjustment),
    cappedAt45: capped,
  });
}
