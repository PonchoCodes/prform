// The world these tests run against: two coaches, two teams, athletes on each.
//
// Every string that identifies team B is deliberately unusual — "Vermillion
// Ridge Distance", "Xanthe Quackenbush". A leak test is only as good as its
// needle: searching a response body for "Team" or "Sarah" would either match
// something innocent or fail to match a real leak. These strings appear in
// exactly one place in the database, so finding one in a response Coach A
// received means Coach A was shown team B's data, with no ambiguity.

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
  coachA: { id: string; email: string };
  coachB: { id: string; email: string };
  teamA: { id: string; name: string; joinCode: string };
  teamB: { id: string; name: string; joinCode: string };
  /** ACTIVE on team A. Sleeps badly, so she lands on Coach A's exception list. */
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
  const coachA = await makeUser("coach.a@example.test", "Ptolemy Marchetti");
  const coachB = await makeUser("coach.b@example.test", "Isolde Fairweather");
  const athleteA = await makeUser("athlete.a@example.test", "Wilhelmina Trzaskowski");
  const athleteB = await makeUser("athlete.b@example.test", "Xanthe Quackenbush");
  const formerAthleteB = await makeUser("former.b@example.test", "Barnabas Oyelaran");

  const teamA = await prisma.team.create({
    data: {
      name: "Kestrel Hollow Distance",
      sport: "track",
      season: "Cross Country 2026",
      coachId: coachA.id,
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
      coachId: coachB.id,
      joinCode: "BBBBBB",
      joinCodeExpiresAt: joinCodeExpiry(),
    },
    select: { id: true, name: true, joinCode: true },
  });

  const consent = { consentAt: new Date(), consentText: TEAM_CONSENT_TEXT };

  await prisma.teamMembership.createMany({
    data: [
      { teamId: teamA.id, userId: athleteA.id, status: "ACTIVE", ...consent },
      { teamId: teamB.id, userId: athleteB.id, status: "ACTIVE", ...consent },
      { teamId: teamB.id, userId: formerAthleteB.id, status: "LEFT", ...consent },
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
    coachA: { id: coachA.id, email: coachA.email },
    coachB: { id: coachB.id, email: coachB.email },
    teamA,
    teamB,
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
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - daysAgo);
    rows.push({ userId, date, ...night, hitTarget: false });
  }
  await prisma.sleepLog.createMany({ data: rows });
}
