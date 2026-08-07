import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertMemberOf } from "@/lib/team/guard";
import { buildLeaderboard, weekStartOf, type MemberForLeaderboard } from "@/lib/team/leaderboard";

// This week's check-in board, visible to everyone on the roster.
//
// The only route under /api/teams that uses the weaker guard. assertMemberOf
// admits any ACTIVE member and the owner; it is listed in MEMBER_SCOPED_ROUTES
// in lib/team/guard.test.ts, which is the deliberate act of saying "the whole
// squad may read this". Everything else on a team stays owner-only.
//
// ── The query is the privacy boundary ───────────────────────────────────────
//
// It selects `date` from SleepLog and nothing else. Not actualSleepHours, not
// targetSleepHours, not hitTarget, not needsReview. That is not a matter of
// filtering the response later — the values are never loaded, so there is no
// step at which a careless spread could put one on the wire.
//
// Contrast with the exceptions endpoint, which does read sleep values and
// reduces them to a colour before responding. That is defensible for one
// person looking at their own athletes. It would not be defensible here, where
// the audience is every teenager on the team.

export const dynamic = "force-dynamic";

/** Today, as the UTC calendar date SleepLog rows are keyed by. */
function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function GET(_req: Request, { params }: { params: { teamId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id as string;

  const team = await assertMemberOf(params.teamId, userId);
  if (!team) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const memberships = await prisma.teamMembership.findMany({
    where: { teamId: team.id, status: "ACTIVE" },
    select: {
      userId: true,
      joinedAt: true,
      user: { select: { name: true } },
    },
    orderBy: { joinedAt: "asc" },
  });

  const today = todayKey();
  const weekStart = weekStartOf(today);

  // Only this week's rows, and only their dates. A tighter window than the
  // board needs would be wrong; a wider one would pull nights nobody is
  // entitled to know about into memory for no reason.
  const logs =
    memberships.length === 0
      ? []
      : await prisma.sleepLog.findMany({
          where: {
            userId: { in: memberships.map((m) => m.userId) },
            date: { gte: new Date(`${weekStart}T00:00:00.000Z`) },
          },
          select: { userId: true, date: true },
        });

  const datesByUser = new Map<string, string[]>();
  for (const log of logs) {
    const key = log.date.toISOString().slice(0, 10);
    const list = datesByUser.get(log.userId);
    if (list) list.push(key);
    else datesByUser.set(log.userId, [key]);
  }

  const members: MemberForLeaderboard[] = memberships.map((m) => ({
    userId: m.userId,
    name: m.user.name,
    joinedOn: m.joinedAt.toISOString().slice(0, 10),
    loggedDates: datesByUser.get(m.userId) ?? [],
  }));

  const board = buildLeaderboard({ members, viewerUserId: userId, today });

  return NextResponse.json({
    teamName: team.name,
    weekStart: board.weekStart,
    windowEnd: board.windowEnd,
    entries: board.entries,
  });
}
