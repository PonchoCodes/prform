import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { todayKey } from "@/lib/dateKeys";
import {
  buildCohorts,
  buildGroupRollups,
  buildWeeklyActive,
  dateKeyOf,
  type UserForRetention,
} from "@/lib/retention";

// Retention, computed here and nowhere else.
//
// Same admin gate as /api/admin/waitlist: the ADMIN_EMAIL on the session, and
// nothing else gets in. This endpoint returns behavioural data about every
// account on the platform, most of them minors', so it is the single most
// sensitive route in the app and the guard is the first thing in the handler.
//
// ── What leaves this endpoint ───────────────────────────────────────────────
//
// Counts. No names, no emails, no user ids, no dates that belong to one person.
// Not because the admin lacks the right to look, but because a page built from
// counts cannot become a page someone browses individual teenagers on, and the
// difference between those two things is a design decision that should be made
// once, here, rather than the first time somebody wants a name.
//
// Team NAMES do appear, because comparing one team against another is the
// question the rollup exists to answer and a row labelled "team 3" answers it
// for nobody.

export const dynamic = "force-dynamic";

/** How many weeks of the active series to return. */
const ACTIVE_WEEKS = 12;

async function requireAdmin(): Promise<NextResponse | null> {
  const session = await getServerSession(authOptions);
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail || session?.user?.email !== adminEmail) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

export async function GET() {
  const forbidden = await requireAdmin();
  if (forbidden) return forbidden;

  const [users, logs, memberships, teams, sentMessages, inbound] = await Promise.all([
    prisma.user.findMany({
      select: { id: true, createdAt: true, onboardingCompletedAt: true },
    }),
    // Dates only. Nothing on this page is about how anyone slept.
    prisma.sleepLog.findMany({ select: { userId: true, date: true } }),
    prisma.teamMembership.findMany({
      where: { status: "ACTIVE" },
      select: { userId: true, teamId: true },
    }),
    prisma.team.findMany({ select: { id: true, name: true } }),
    prisma.sentMessage.groupBy({
      by: ["channel", "status"],
      _sum: { sendCount: true },
      _count: { _all: true },
    }),
    prisma.inboundMessage.findMany({ select: { userId: true } }),
  ]);

  const datesByUser = new Map<string, string[]>();
  for (const log of logs) {
    const key = dateKeyOf(log.date);
    const list = datesByUser.get(log.userId);
    if (list) list.push(key);
    else datesByUser.set(log.userId, [key]);
  }

  const teamsByUser = new Map<string, string[]>();
  for (const m of memberships) {
    const list = teamsByUser.get(m.userId);
    if (list) list.push(m.teamId);
    else teamsByUser.set(m.userId, [m.teamId]);
  }

  const shaped: UserForRetention[] = users.map((u) => ({
    id: u.id,
    createdOn: dateKeyOf(u.createdAt),
    onboardingCompletedOn: u.onboardingCompletedAt ? dateKeyOf(u.onboardingCompletedAt) : null,
    loggedDates: datesByUser.get(u.id) ?? [],
    teamIds: teamsByUser.get(u.id) ?? [],
  }));

  const today = todayKey();

  // ── message stats ─────────────────────────────────────────────────────────
  //
  // Meaningful only once SMS is live. Until then every row is DRY_RUN and the
  // page says so rather than showing four zeroes that look like a failure.
  const messageTotals = { dryRun: 0, sent: 0, delivered: 0, failed: 0, canceled: 0, scheduled: 0 };
  for (const row of sentMessages) {
    const n = row._sum.sendCount ?? row._count._all;
    switch (row.status) {
      case "DRY_RUN":
        messageTotals.dryRun += n;
        break;
      case "SENT":
        messageTotals.sent += n;
        break;
      case "DELIVERED":
        // Delivered implies sent. Counted in both so "sent" is the total that
        // left the building rather than the leftovers of a status machine.
        messageTotals.sent += n;
        messageTotals.delivered += n;
        break;
      case "FAILED":
        messageTotals.failed += n;
        break;
      case "CANCELED":
        messageTotals.canceled += n;
        break;
      case "SCHEDULED":
        messageTotals.scheduled += n;
        break;
    }
  }

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    totals: {
      users: users.length,
      everLogged: shaped.filter((u) => u.loggedDates.length > 0).length,
      teams: teams.length,
    },
    cohorts: buildCohorts(shaped, today),
    weeklyActive: buildWeeklyActive(shaped, today, ACTIVE_WEEKS),
    groups: buildGroupRollups(shaped, new Map(teams.map((t) => [t.id, t.name])), today),
    messages: {
      ...messageTotals,
      /** Distinct athletes who have ever replied. */
      replied: new Set(inbound.map((m) => m.userId).filter(Boolean)).size,
      /** True while nothing has actually been handed to a provider. */
      dryRunOnly: messageTotals.sent === 0 && messageTotals.dryRun > 0,
    },
  });
}
