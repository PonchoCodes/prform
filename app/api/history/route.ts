import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { mpsToMinPerMile } from "@/lib/paceUtils";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id;

  const { searchParams } = new URL(req.url);
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const cursor = searchParams.get("cursor"); // date string, exclusive
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "60"), 120);

  const dateFilter: any = {};
  if (startDate) dateFilter.gte = new Date(startDate + "T00:00:00.000Z");
  if (endDate) dateFilter.lte = new Date(endDate + "T23:59:59.999Z");
  if (cursor) dateFilter.lt = new Date(cursor + "T23:59:59.999Z");

  const [sleepLogs, activities] = await Promise.all([
    prisma.sleepLog.findMany({
      where: { userId, ...(Object.keys(dateFilter).length ? { date: dateFilter } : {}) },
      orderBy: { date: "desc" },
      take: limit + 1,
    }),
    prisma.stravaActivity.findMany({
      where: { userId, ...(Object.keys(dateFilter).length ? { startDate: dateFilter } : {}) },
      orderBy: { startDate: "desc" },
      take: limit + 1,
    }),
  ]);

  // Merge by date
  const byDate = new Map<string, { sleepLog?: any; activity?: any }>();

  for (const log of sleepLogs) {
    const d = new Date(log.date).toISOString().slice(0, 10);
    const entry = byDate.get(d) ?? {};
    entry.sleepLog = log;
    byDate.set(d, entry);
  }

  for (const act of activities) {
    const d = new Date(act.startDate).toISOString().slice(0, 10);
    const entry = byDate.get(d) ?? {};
    if (!entry.activity || new Date(act.startDate) > new Date(entry.activity.startDate)) {
      entry.activity = act;
    }
    byDate.set(d, entry);
  }

  const sorted = Array.from(byDate.entries()).sort(([a], [b]) => b.localeCompare(a));
  const page = sorted.slice(0, limit);
  const hasMore = sorted.length > limit;
  const nextCursor = hasMore ? page[page.length - 1][0] : undefined;

  const rows = page.map(([date, { sleepLog, activity }]) => {
    const hitTarget = sleepLog?.hitTarget;
    const status =
      hitTarget === true ? "HIT" :
      hitTarget === false ? "MISSED" :
      sleepLog ? "UNLOGGED" : "NO_DATA";

    return {
      date,
      sleepLog: sleepLog ? {
        recommendedBedtime: sleepLog.recommendedBedtime,
        actualBedtime: sleepLog.actualBedtime,
        hitTarget: sleepLog.hitTarget,
      } : undefined,
      activity: activity ? {
        name: activity.name,
        distance: activity.distance,
        averageSpeed: activity.averageSpeed,
        workoutType: activity.workoutType,
        pace: mpsToMinPerMile(activity.averageSpeed),
      } : undefined,
      status,
      nextCursor,
    };
  });

  return NextResponse.json({ rows, nextCursor });
}
