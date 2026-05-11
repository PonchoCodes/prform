import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function parseTimeMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function computeSleepHours(bedtime: string, waketime: string): number {
  return ((parseTimeMin(waketime) - parseTimeMin(bedtime) + 1440) % 1440) / 60;
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id;

  const existing = await prisma.sleepLog.findUnique({ where: { id: params.id } });
  if (!existing || existing.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const { hitTarget, actualBedtime, actualWakeTime } = body;

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { currentWakeTime: true } });

  const resolvedHitTarget = hitTarget !== undefined ? hitTarget : existing.hitTarget;
  const resolvedActualBedtime = resolvedHitTarget
    ? existing.recommendedBedtime
    : (actualBedtime ?? existing.actualBedtime ?? existing.recommendedBedtime);
  const resolvedWake = actualWakeTime ?? existing.actualWakeTime ?? user?.currentWakeTime ?? "06:00";
  const actualSleepHours = computeSleepHours(resolvedActualBedtime, resolvedWake);

  const log = await prisma.sleepLog.update({
    where: { id: params.id },
    data: {
      hitTarget: resolvedHitTarget,
      actualBedtime: resolvedActualBedtime,
      actualWakeTime: resolvedWake,
      actualSleepHours: Math.round(actualSleepHours * 100) / 100,
    },
  });

  return NextResponse.json(log);
}
