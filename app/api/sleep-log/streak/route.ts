import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function parseTimeMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id;

  const logs = await prisma.sleepLog.findMany({
    where: { userId },
    orderBy: { date: "desc" },
  });

  if (logs.length === 0) {
    return NextResponse.json({
      currentStreak: 0,
      longestStreak: 0,
      hitRateLast7: 0,
      hitRateLast30: 0,
      avgDeviationMinutes: 0,
      consecutiveMisses: 0,
    });
  }

  // consecutiveMisses: most recent consecutive logs where hitTarget=false
  let consecutiveMisses = 0;
  for (const log of logs) {
    if (log.hitTarget === false) consecutiveMisses++;
    else break;
  }

  // currentStreak: most recent consecutive logs where hitTarget=true
  let currentStreak = 0;
  for (const log of logs) {
    if (log.hitTarget === true) currentStreak++;
    else break;
  }

  // longestStreak
  let longestStreak = 0;
  let runningStreak = 0;
  for (const log of [...logs].reverse()) {
    if (log.hitTarget === true) {
      runningStreak++;
      if (runningStreak > longestStreak) longestStreak = runningStreak;
    } else {
      runningStreak = 0;
    }
  }

  // hitRateLast7 and hitRateLast30 (based on logged nights only)
  const now = new Date();
  const cutoff7 = new Date(now);
  cutoff7.setDate(now.getDate() - 7);
  const cutoff30 = new Date(now);
  cutoff30.setDate(now.getDate() - 30);

  const last7 = logs.filter((l) => new Date(l.date) >= cutoff7);
  const last30 = logs.filter((l) => new Date(l.date) >= cutoff30);

  const hitRateLast7 = last7.length > 0
    ? Math.round((last7.filter((l) => l.hitTarget === true).length / last7.length) * 100)
    : 0;
  const hitRateLast30 = last30.length > 0
    ? Math.round((last30.filter((l) => l.hitTarget === true).length / last30.length) * 100)
    : 0;

  // avgDeviationMinutes: average minutes late for misses (actualBedtime - recommendedBedtime)
  const misses = logs.filter((l) => l.hitTarget === false && l.actualBedtime && l.recommendedBedtime);
  let avgDeviationMinutes = 0;
  if (misses.length > 0) {
    const totalDev = misses.reduce((sum, l) => {
      const actual = parseTimeMin(l.actualBedtime!);
      const rec = parseTimeMin(l.recommendedBedtime);
      let dev = actual - rec;
      if (dev > 720) dev -= 1440;
      if (dev < -720) dev += 1440;
      return sum + dev;
    }, 0);
    avgDeviationMinutes = Math.round(totalDev / misses.length);
  }

  return NextResponse.json({
    currentStreak,
    longestStreak,
    hitRateLast7,
    hitRateLast30,
    avgDeviationMinutes,
    consecutiveMisses,
  });
}
