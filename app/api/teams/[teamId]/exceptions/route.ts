import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertCoachOf } from "@/lib/team/guard";
import { deriveAthleteStatus } from "@/lib/team/status";

// The coach dashboard's data: an exception list, not a roster table.
//
// What leaves this endpoint per athlete is a name, a color, a counts-based
// trend sentence, and a recommendation — the exact set the consent screen
// promises, derived in lib/team/status.ts. Raw sleep rows are read here and
// die here. No bedtime, wake time, hours value, pace, or message can appear
// in the response shape, and there is no sort order or score to compare
// athletes against each other.

const STATUS_WINDOW_DAYS = 7;

export async function GET(_req: Request, { params }: { params: { teamId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id as string;

  const team = await assertCoachOf(params.teamId, userId);
  if (!team) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const memberships = await prisma.teamMembership.findMany({
    where: { teamId: team.id, status: "ACTIVE" },
    select: {
      userId: true,
      user: { select: { name: true } },
    },
    orderBy: { joinedAt: "asc" },
  });

  const windowStart = new Date();
  windowStart.setHours(0, 0, 0, 0);
  windowStart.setDate(windowStart.getDate() - STATUS_WINDOW_DAYS);

  const logs = await prisma.sleepLog.findMany({
    where: {
      userId: { in: memberships.map((m) => m.userId) },
      date: { gte: windowStart },
    },
    select: {
      userId: true,
      date: true,
      actualSleepHours: true,
      targetSleepHours: true,
      needsReview: true,
    },
    orderBy: { date: "asc" },
  });

  const logsByUser = new Map<string, typeof logs>();
  for (const log of logs) {
    const list = logsByUser.get(log.userId);
    if (list) list.push(log);
    else logsByUser.set(log.userId, [log]);
  }

  let green = 0;
  const exceptions: Array<{
    name: string;
    color: "amber" | "red";
    trend: string;
    recommendation: string;
  }> = [];

  for (const member of memberships) {
    const nights = (logsByUser.get(member.userId) ?? []).map((l) => ({
      date: new Date(l.date).toISOString().slice(0, 10),
      actualSleepHours: l.actualSleepHours,
      targetSleepHours: l.targetSleepHours,
      needsReview: l.needsReview,
    }));
    const status = deriveAthleteStatus(nights, STATUS_WINDOW_DAYS);

    if (!status.flagged) {
      green++;
      continue;
    }
    exceptions.push({
      name: member.user.name ?? "Unnamed athlete",
      color: status.color as "amber" | "red",
      trend: status.trend,
      recommendation: status.recommendation,
    });
  }

  // Red before amber so the top of the list is the athlete to talk to first.
  // Within a color, roster (join) order — deliberately nothing performance-ish.
  exceptions.sort((a, b) => (a.color === b.color ? 0 : a.color === "red" ? -1 : 1));

  return NextResponse.json({
    teamName: team.name,
    rosterSize: memberships.length,
    onTrack: green,
    exceptions,
  });
}
