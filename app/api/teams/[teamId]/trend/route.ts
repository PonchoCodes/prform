import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertCoachAccess } from "@/lib/entitlements";
import { buildTeamTrend, DEFAULT_WEEKS } from "@/lib/teamTrend";
import { isHardWorkout } from "@/lib/workoutTypes";
import { addDays, toKey, toUtc, todayKey, weekStartOf } from "@/lib/dateKeys";

// The team trend: eight weeks of compliance, logging and short nights, with
// the team's hard sessions under them, and a per-athlete row for this week.
//
// Sleep rows are read here and die here; the payload is what buildTeamTrend
// returns, which lib/teamTrend.test.ts walks through the coach copy guard.
// Trends are part of the plan (lib/entitlements.ts), so the route goes
// through assertCoachAccess and then checks the trends feature itself: the
// two are the same today, and checking the named feature keeps this route
// correct if they ever diverge.

export async function GET(_req: Request, { params }: { params: { teamId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id as string;

  const access = await assertCoachAccess(params.teamId, userId);
  if (!access.ok && access.reason === "not_owner") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!access.ok || !access.entitlement.features.trends) {
    return NextResponse.json(
      {
        error: "The team trend is part of the team plan.",
        code: "UPGRADE_REQUIRED",
        source: access.ok ? access.entitlement.source : access.entitlement.source,
      },
      { status: 402 },
    );
  }

  const { team, athletes } = access;
  const today = todayKey();
  const firstWeekStart = addDays(weekStartOf(today), -7 * (DEFAULT_WEEKS - 1));
  const from = toUtc(firstWeekStart);
  const todayStart = toUtc(today);

  const [logs, sessions] = await Promise.all([
    prisma.sleepLog.findMany({
      where: {
        userId: { in: athletes.map((a) => a.userId) },
        date: { gte: from, lt: todayStart },
      },
      select: {
        userId: true,
        date: true,
        actualSleepHours: true,
        targetSleepHours: true,
        hitTarget: true,
        needsReview: true,
      },
    }),
    prisma.plannedSession.findMany({
      where: { teamId: team.id, date: { gte: from, lt: toUtc(addDays(today, 7)) } },
      select: { date: true, sessionType: true },
    }),
  ]);

  const trend = buildTeamTrend({
    members: athletes.map((a) => ({ userId: a.userId, name: a.name, joinedOn: toKey(a.joinedAt) })),
    nights: logs.map((l) => ({
      userId: l.userId,
      date: toKey(l.date),
      actualSleepHours: l.actualSleepHours,
      targetSleepHours: l.targetSleepHours,
      hitTarget: l.hitTarget,
      needsReview: l.needsReview,
    })),
    hardSessionDates: sessions.filter((s) => isHardWorkout(s.sessionType)).map((s) => toKey(s.date)),
    today,
  });

  return NextResponse.json(trend);
}
