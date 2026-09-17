// Team meets, merged into each athlete's plan.
//
// The same overlay as teamSessionsByDate in lib/workoutDataSource.ts, for the
// other thing a coach puts on a calendar. calculateSleepPlan already knows how
// to ramp toward a MeetInput; this file's whole job is to make a TeamMeet
// arrive there as one, so the ramp an athlete gets from a coach's entry is
// the same ramp, from the same code, as the one they get from their own.
//
// Every caller that used to fetch `prisma.meet` for the plan goes through
// meetsForPlan now. Three call sites (the sleep-plan route, the messaging
// cron, lib/messaging/plan.ts) were each building the MeetInput list
// themselves, which is exactly how a team meet would have reached the
// dashboard and not the morning text.

import { prisma } from "@/lib/prisma";
import type { MeetInput } from "@/lib/sleepAlgorithm";
import { toKey } from "@/lib/dateKeys";

/**
 * B, not A. A coach's calendar tends to list every fixture, and an A ramp
 * from each of them would run the athlete's bedtime forward for most of a
 * season. B still fires the full phase advance inside ten days and the
 * extension window before it; if a particular race is the one that matters
 * to an athlete, their own A-priority Meet on that date takes precedence.
 */
export const TEAM_MEET_PRIORITY: MeetInput["priority"] = "B";

export interface OwnMeetForPlan {
  date: Date;
  priority: string;
  name: string;
  raceTime?: string | null;
}

export interface TeamMeetForPlan {
  date: Date;
  name: string;
}

/**
 * The merge, pure so it can be tested: the athlete's own meets first, then
 * any team meet on a date they have nothing on. Same date, own meet wins —
 * it carries a priority and a race time the athlete chose, and the algorithm
 * cannot ramp toward two meets on one day anyway.
 */
export function mergeMeetsForPlan(own: OwnMeetForPlan[], team: TeamMeetForPlan[]): MeetInput[] {
  const merged: MeetInput[] = own.map((m) => ({
    date: m.date,
    priority: m.priority as MeetInput["priority"],
    name: m.name,
    raceTime: m.raceTime ?? null,
  }));
  const taken = new Set(own.map((m) => toKey(new Date(m.date))));

  for (const t of team) {
    const key = toKey(new Date(t.date));
    if (taken.has(key)) continue;
    taken.add(key);
    merged.push({ date: t.date, priority: TEAM_MEET_PRIORITY, name: t.name, raceTime: null });
  }

  return merged.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

/** Everything the plan should ramp toward for one athlete. */
export async function meetsForPlan(userId: string): Promise<MeetInput[]> {
  const [own, memberships] = await Promise.all([
    prisma.meet.findMany({
      where: { userId },
      orderBy: { date: "asc" },
      select: { date: true, priority: true, name: true, raceTime: true },
    }),
    prisma.teamMembership.findMany({
      where: { userId, status: "ACTIVE" },
      select: { teamId: true },
    }),
  ]);

  const team =
    memberships.length === 0
      ? []
      : await prisma.teamMeet.findMany({
          where: { teamId: { in: memberships.map((m) => m.teamId) } },
          orderBy: { date: "asc" },
          select: { date: true, name: true },
        });

  return mergeMeetsForPlan(own, team);
}
