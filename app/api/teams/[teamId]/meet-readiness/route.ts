import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertCoachAccess } from "@/lib/entitlements";
import { deriveMeetReadiness, RAMP_DAYS } from "@/lib/team/meetReadiness";
import { isHardWorkout } from "@/lib/workoutTypes";
import { toKey, todayKey } from "@/lib/dateKeys";

// The next team meet, per athlete: readiness colour, ramp status, one line.
//
// Same contract as ./exceptions. Sleep rows are read here and die here; what
// leaves is the output of deriveMeetReadiness, which lib/team/meetReadiness
// .test.ts holds to the coach copy guard. Per-athlete, so it is the paid half
// and goes through assertCoachAccess: a free team gets 402 and keeps the meet
// on its calendar.

/** Enough history to cover the ramp plus the trailing week either side. */
const HISTORY_DAYS = RAMP_DAYS + 7;

export async function GET(_req: Request, { params }: { params: { teamId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id as string;

  const access = await assertCoachAccess(params.teamId, userId);
  if (!access.ok && access.reason === "not_owner") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!access.ok) {
    return NextResponse.json(
      {
        error: "Meet readiness is part of the team plan.",
        code: "UPGRADE_REQUIRED",
        source: access.entitlement.source,
      },
      { status: 402 },
    );
  }

  const { team, athletes } = access;
  const today = todayKey();
  const todayStart = new Date(`${today}T00:00:00.000Z`);

  const meet = await prisma.teamMeet.findFirst({
    where: { teamId: team.id, date: { gte: todayStart } },
    orderBy: { date: "asc" },
    select: { id: true, name: true, date: true, distances: true },
  });
  if (!meet) return NextResponse.json({ meet: null });

  const historyStart = new Date(todayStart);
  historyStart.setUTCDate(historyStart.getUTCDate() - HISTORY_DAYS);

  const [logs, hardSessions] = await Promise.all([
    prisma.sleepLog.findMany({
      where: {
        userId: { in: athletes.map((a) => a.userId) },
        date: { gte: historyStart, lt: todayStart },
      },
      select: {
        userId: true,
        date: true,
        actualSleepHours: true,
        targetSleepHours: true,
        hitTarget: true,
        needsReview: true,
      },
      orderBy: { date: "asc" },
    }),
    prisma.plannedSession.findMany({
      where: { teamId: team.id, date: { gte: todayStart, lt: meet.date } },
      select: { date: true, sessionType: true },
    }),
  ]);

  const nightsByUser = new Map<string, typeof logs>();
  for (const log of logs) {
    const list = nightsByUser.get(log.userId);
    if (list) list.push(log);
    else nightsByUser.set(log.userId, [log]);
  }

  const readiness = deriveMeetReadiness({
    meet: { name: meet.name, date: toKey(meet.date), distances: meet.distances },
    today,
    athletes: athletes.map((a) => ({
      name: a.name,
      joinedOn: toKey(a.joinedAt),
      nights: (nightsByUser.get(a.userId) ?? []).map((l) => ({
        date: toKey(l.date),
        actualSleepHours: l.actualSleepHours,
        targetSleepHours: l.targetSleepHours,
        hitTarget: l.hitTarget,
        needsReview: l.needsReview,
      })),
    })),
    hardSessionDates: hardSessions.filter((s) => isHardWorkout(s.sessionType)).map((s) => toKey(s.date)),
  });

  return NextResponse.json({ ...readiness, meet: { id: meet.id, ...readiness.meet } });
}
