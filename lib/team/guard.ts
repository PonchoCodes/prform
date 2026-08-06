// Authorization for coach routes.
//
// Every route under /api/teams/[teamId] must call one of these before touching
// anything, and lib/team/guard.test.ts enforces that by scanning the route
// sources. The decision itself is pure (isCoachOf) so the rule is testable
// without a database; assertCoachOf is the prisma-backed wrapper routes use.

import { prisma } from "@/lib/prisma";

export interface TeamForGuard {
  id: string;
  coachId: string;
}

/** The rule, stated once: you coach a team iff the team says you do. */
export function isCoachOf(team: TeamForGuard | null, userId: string): boolean {
  return team !== null && team.coachId === userId;
}

/**
 * Loads the team and checks the caller coaches it. Returns the team, or null —
 * and the caller must translate null into a 403 and return, never continue.
 *
 * Null covers both "team does not exist" and "team is not yours" on purpose:
 * distinguishing them would let anyone probe which team ids exist.
 */
export async function assertCoachOf(teamId: string, userId: string) {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { id: true, coachId: true, name: true, joinCode: true, joinCodeExpiresAt: true },
  });
  return isCoachOf(team, userId) ? team : null;
}
