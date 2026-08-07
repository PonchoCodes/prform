// The world these tests run against: two owners with a team each, athletes on
// both, plus a captain who owns a third team and also runs on it.
//
// The captain is not decoration. Once anyone can make a team, the person who
// organizes the squad is usually also on it, and "owner" and "member" became
// two facts that can both be true of one person. Every guard, every roster
// count and every leaderboard has to survive that, and it is the case that no
// amount of testing with a non-running coach would ever exercise.
//
// Every string that identifies team B is deliberately unusual — "Vermillion
// Ridge Distance", "Xanthe Quackenbush". A leak test is only as good as its
// needle: searching a response body for "Team" or "Sarah" would either match
// something innocent or fail to match a real leak. These strings appear in
// exactly one place in the database, so finding one in a response owner A
// received means owner A was shown team B's data, with no ambiguity.

import { prisma } from "@/lib/prisma";
import { TEAM_CONSENT_TEXT } from "@/lib/team/consent";
import { joinCodeExpiry } from "@/lib/team/joinCode";

/** Tables these tests write. Truncated between cases, CASCADE for the rest. */
const SEEDED_TABLES = ["SleepLog", "PlannedSession", "TeamMembership", "Team", "User"];

export async function resetDatabase() {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${SEEDED_TABLES.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`,
  );
}

export interface World {
  ownerA: { id: string; email: string };
  ownerB: { id: string; email: string };
  /** Owns team C and is an ACTIVE member of it — a captain who also runs. */
  captain: { id: string; name: string; email: string };
  teamA: { id: string; name: string; joinCode: string };
  teamB: { id: string; name: string; joinCode: string };
  teamC: { id: string; name: string; joinCode: string };
  /**
   * ACTIVE on team A and on team C — cross country and track are different
   * rosters, and one athlete belongs to both. Sleeps badly, so she lands on
   * both owners' exception lists.
   */
  athleteA: { id: string; name: string };
  /** ACTIVE on team B. */
  athleteB: { id: string; name: string };
  /** Was on team B, status LEFT. Still holds a membership row. */
  formerAthleteB: { id: string; name: string };
  /** A planned session owned by team B. */
  sessionB: { id: string; description: string; targetPaces: string };
  /** A team id that has never existed. */
  missingTeamId: string;
}

/** Sleep values seeded for athlete A — the privacy tests hunt for these. */
export const ATHLETE_A_SLEEP = {
  recommendedBedtime: "21:47",
  actualBedtime: "23:52",
  actualWakeTime: "05:13",
  actualSleepHours: 5.35,
  targetSleepHours: 9.25,
};

async function makeUser(email: string, name: string) {
  return prisma.user.create({
    // The password is a literal, not a hash: nothing in these tests goes
    // through the credentials provider, and a real bcrypt round per user
    // would dominate the runtime of the suite.
    data: { email, name, password: "not-a-real-hash", onboardingDone: true },
    select: { id: true, email: true, name: true },
  });
}

export async function seedWorld(): Promise<World> {
  const ownerA = await makeUser("owner.a@example.test", "Ptolemy Marchetti");
  const ownerB = await makeUser("owner.b@example.test", "Isolde Fairweather");
  const captain = await makeUser("captain.c@example.test", "Grizelda Ashenfelter");
  const athleteA = await makeUser("athlete.a@example.test", "Wilhelmina Trzaskowski");
  const athleteB = await makeUser("athlete.b@example.test", "Xanthe Quackenbush");
  const formerAthleteB = await makeUser("former.b@example.test", "Barnabas Oyelaran");

  const teamA = await prisma.team.create({
    data: {
      name: "Kestrel Hollow Distance",
      sport: "track",
      season: "Cross Country 2026",
      ownerId: ownerA.id,
      joinCode: "AAAAAA",
      joinCodeExpiresAt: joinCodeExpiry(),
    },
    select: { id: true, name: true, joinCode: true },
  });

  const teamB = await prisma.team.create({
    data: {
      name: "Vermillion Ridge Distance",
      sport: "track",
      season: "Cross Country 2026",
      ownerId: ownerB.id,
      joinCode: "BBBBBB",
      joinCodeExpiresAt: joinCodeExpiry(),
    },
    select: { id: true, name: true, joinCode: true },
  });

  // The captain's team. Owned by someone who is also on the roster, which is
  // the arrangement open team creation makes ordinary.
  const teamC = await prisma.team.create({
    data: {
      name: "Thistlewaite Track Club",
      sport: "track",
      season: "Outdoor 2027",
      ownerId: captain.id,
      joinCode: "CCCCCC",
      joinCodeExpiresAt: joinCodeExpiry(),
    },
    select: { id: true, name: true, joinCode: true },
  });

  const consent = { consentAt: new Date(), consentText: TEAM_CONSENT_TEXT };

  await prisma.teamMembership.createMany({
    data: [
      { teamId: teamA.id, userId: athleteA.id, status: "ACTIVE", joinedAt: joinedDaysAgo(40), ...consent },
      { teamId: teamB.id, userId: athleteB.id, status: "ACTIVE", joinedAt: joinedDaysAgo(39), ...consent },
      { teamId: teamB.id, userId: formerAthleteB.id, status: "LEFT", joinedAt: joinedDaysAgo(38), ...consent },
      // The captain on her own roster.
      { teamId: teamC.id, userId: captain.id, status: "ACTIVE", joinedAt: joinedDaysAgo(37), ...consent },
      // Athlete A on a second team. Two ACTIVE memberships for one user is the
      // normal case, not an edge one: cross country and track are two rosters.
      { teamId: teamC.id, userId: athleteA.id, status: "ACTIVE", joinedAt: joinedDaysAgo(36), ...consent },
    ],
  });

  // Both athletes sleep badly enough to be flagged, so both teams' exception
  // lists are non-empty. A leak test against an empty list passes for the
  // wrong reason.
  await seedShortNights(athleteA.id, ATHLETE_A_SLEEP);
  await seedShortNights(athleteB.id, {
    recommendedBedtime: "22:00",
    actualBedtime: "00:41",
    actualWakeTime: "06:02",
    actualSleepHours: 5.1,
    targetSleepHours: 9.0,
  });

  const sessionB = await prisma.plannedSession.create({
    data: {
      teamId: teamB.id,
      date: new Date(),
      sessionType: "tempo",
      durationMinutes: 55,
      description: "Zephyr loop tempo, Quillon gate to the boathouse",
      targetPaces: "6x1200 @ 3:52/km",
    },
    select: { id: true, description: true, targetPaces: true },
  });

  return {
    ownerA: { id: ownerA.id, email: ownerA.email },
    ownerB: { id: ownerB.id, email: ownerB.email },
    captain: {
      id: captain.id,
      name: captain.name as string,
      email: captain.email,
    },
    teamA,
    teamB,
    teamC,
    athleteA: { id: athleteA.id, name: athleteA.name as string },
    athleteB: { id: athleteB.id, name: athleteB.name as string },
    formerAthleteB: { id: formerAthleteB.id, name: formerAthleteB.name as string },
    sessionB: {
      id: sessionB.id,
      description: sessionB.description as string,
      targetPaces: sessionB.targetPaces as string,
    },
    missingTeamId: "clzzzzzzzzzzzzzzzzzzzzzzz",
  };
}

/** Five short nights inside the status window, so the athlete flags red. */
async function seedShortNights(
  userId: string,
  night: {
    recommendedBedtime: string;
    actualBedtime: string;
    actualWakeTime: string;
    actualSleepHours: number;
    targetSleepHours: number;
  },
) {
  const rows = [];
  for (let daysAgo = 1; daysAgo <= 5; daysAgo++) {
    // UTC midnight, matching how the app itself writes a night:
    // `new Date(dateStr + "T00:00:00.000Z")` in /api/sleep-log. Local midnight
    // here would store 04:00Z for an athlete in New York, and every consumer
    // that reads a date back with toISOString().slice(0, 10) would be reading
    // rows that are shaped differently from production ones.
    const date = new Date();
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() - daysAgo);
    rows.push({ userId, date, ...night, hitTarget: false });
  }
  await prisma.sleepLog.createMany({ data: rows });
}

/**
 * A membership that has existed for a while.
 *
 * Everyone joining "just now" is not a roster, it is a roster's first minute,
 * and several things are vacuous against it: the leaderboard gives a
 * brand-new member zero possible nights (correctly — they have not had a night
 * as a member yet), so a world where everybody joined today produces a board
 * of zeroes that proves nothing. Staggered so `orderBy: { joinedAt: "asc" }`
 * stays deterministic.
 */
function joinedDaysAgo(days: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d;
}
