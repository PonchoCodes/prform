// Authorization for team routes.
//
// Two rules, and every route under /api/teams has to satisfy one of them:
//
//   assertOwnerOf  — you made this team. Rotating the join code, planning
//                    sessions, reading the exception list.
//   assertMemberOf — you are on this team's roster. Anything the whole squad
//                    can see.
//
// lib/team/guard.test.ts enforces that by scanning the route sources, so a new
// route that forgets to call either one fails the build. The decisions
// themselves are pure (isOwnerOf) so the rules are testable without a database;
// the assert* wrappers are the prisma-backed versions routes use.
//
// "Owner" rather than "coach" throughout: a team captain who organizes six
// people is as legitimate an owner as a salaried coach. The permissions never
// depended on which of the two you were — only the word did.

import { prisma } from "@/lib/prisma";

export interface TeamForGuard {
  id: string;
  ownerId: string;
}

/** The rule, stated once: you own a team iff the team says you do. */
export function isOwnerOf(team: TeamForGuard | null, userId: string): boolean {
  return team !== null && team.ownerId === userId;
}

/**
 * Loads the team and checks the caller owns it. Returns the team, or null —
 * and the caller must translate null into a 403 and return, never continue.
 *
 * Null covers both "team does not exist" and "team is not yours" on purpose:
 * distinguishing them would let anyone probe which team ids exist.
 */
export async function assertOwnerOf(teamId: string, userId: string) {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { id: true, ownerId: true, name: true, joinCode: true, joinCodeExpiresAt: true },
  });
  return isOwnerOf(team, userId) ? team : null;
}

/**
 * Loads the team and checks the caller is on its roster — as an ACTIVE member,
 * or as its owner.
 *
 * The owner is admitted whether or not they hold a membership row, because
 * owning a team and being on its roster are now separate facts: a coach who
 * does not run may own a team and never join it, and a captain may do both.
 * Anything the squad can see, the person who made the team can see.
 *
 * Deliberately NOT a substitute for assertOwnerOf. This is the weaker check —
 * it admits every athlete on the team — and it exists for team-wide reads
 * (the consistency leaderboard) rather than for anything that changes state or
 * exposes one athlete's status to another.
 *
 * Returns the team plus whether the caller owns it, or null. Same
 * indistinguishable-null rule as above.
 */
export async function assertMemberOf(teamId: string, userId: string) {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { id: true, ownerId: true, name: true },
  });
  if (!team) return null;

  if (team.ownerId === userId) return { ...team, isOwner: true };

  const membership = await prisma.teamMembership.findUnique({
    where: { teamId_userId: { teamId, userId } },
    select: { status: true },
  });
  // A membership that is LEFT or REMOVED is not a membership. Keeping the row
  // is what preserves the consent record; it must never keep the access.
  if (membership?.status !== "ACTIVE") return null;

  return { ...team, isOwner: false };
}
