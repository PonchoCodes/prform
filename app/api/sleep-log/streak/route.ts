import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computeCheckInStreak } from "@/lib/streak";

// Two different quantities live in this response, and confusing them is the
// mistake this comment exists to prevent.
//
//   checkIn        — consecutive days the athlete CHECKED IN. A habit. This is
//                    the one shown to the athlete as "your streak", and a
//                    missed sleep target never breaks it.
//   currentStreak  — consecutive nights that HIT THEIR TARGET. Kept because the
//     / longestStreak  hit rates below are the same family of number and the
//                    sleep page reports them honestly as such. It is not a
//                    streak in the motivational sense and must never be
//                    labelled as one: a teenager who was up until 1am with a
//                    lab report and logged it honestly did the thing we want,
//                    and zeroing a counter for it teaches them to stop
//                    reporting bad nights.

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
      checkIn: {
        current: 0,
        longest: 0,
        forgivenInCurrent: 0,
        atRisk: false,
        canSkipTonight: true,
        heldInCurrent: 0,
        onHoldToday: false,
      },
      currentStreak: 0,
      longestStreak: 0,
      hitRateLast7: 0,
      hitRateLast30: 0,
      avgDeviationMinutes: 0,
      consecutiveMisses: 0,
    });
  }

  // Dates only. The streak is a habit measure and has no business seeing a
  // duration: passing the rows in would make it possible for a future edit to
  // start counting targets, which is the one thing it must never do.
  const holds = await prisma.streakHold.findMany({
    where: { userId },
    select: { startsOn: true, endsOn: true },
  });

  const checkIn = computeCheckInStreak({
    loggedDates: logs.map((l) => l.date.toISOString().slice(0, 10)),
    today: new Date().toISOString().slice(0, 10),
    holds: holds.map((h) => ({
      startsOn: h.startsOn.toISOString().slice(0, 10),
      endsOn: h.endsOn.toISOString().slice(0, 10),
    })),
  });

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
    checkIn,
    currentStreak,
    longestStreak,
    hitRateLast7,
    hitRateLast30,
    avgDeviationMinutes,
    consecutiveMisses,
  });
}
