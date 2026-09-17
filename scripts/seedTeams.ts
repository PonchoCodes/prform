import { PrismaClient } from "@prisma/client";
import { neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import bcrypt from "bcryptjs";
import ws from "ws";
import "dotenv/config";
import { generateJoinCode, joinCodeExpiry } from "../lib/team/joinCode";
import { TEAM_CONSENT_TEXT } from "../lib/team/consent";

// Two coach accounts, each owning a populated team, for walking the team
// product by hand: one on the free tier, one with a live paid subscription.
//
//   npm run seed:teams
//
// Writes to whatever DATABASE_URL points at. Re-runnable: every account it
// creates is deleted first, and every team, membership, session and sleep log
// hangs off one of those accounts by cascade, so a re-run leaves no strays.
//
// The paid team's Stripe ids are fabricated. The webhook looks subscriptions
// up by id, so no real Stripe event can ever match them, and nothing here
// touches Stripe itself. lib/entitlements.ts resolves PAID + "active" as a
// live plan, which is all the coach-side surfaces check.
//
// Seat limits are written literally rather than imported from
// lib/entitlements.ts, which pulls in the app's prisma client and does not
// load under the seed tsconfig.

neonConfig.webSocketConstructor = ws;
const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const PASSWORD = "test1234";
const TZ = "America/New_York";
const WAKE = "06:30";

// ── Athlete profiles ─────────────────────────────────────────────────────────
// Each one is chosen to land on a specific colour in lib/team/status.ts over
// the 7-night window, and on a distinct rate on the weekly leaderboard.
//
//   solid     logs every night, on target                     → green
//   spotty    logs about half the nights, fine when logged    → green, low rate
//   slipping  logs every night, two short in the last seven   → amber
//   short     logs every night, five short in the last seven  → red
//   silent    logged two weeks ago, nothing in the last seven → amber (no data)
//   new       joined two days ago, one night logged           → green, mid-week joiner
type Profile = "solid" | "spotty" | "slipping" | "short" | "silent" | "new";

interface AthleteSpec {
  name: string;
  age: number;
  sex: "male" | "female";
  profile: Profile;
  /** Days before today the membership starts. */
  joinedDaysAgo: number;
  targetHours: number;
}

interface TeamSpec {
  slug: string;
  name: string;
  season: string;
  coach: { email: string; name: string; age: number };
  entitlement: "FREE" | "PAID";
  athleteLevel: "high_school" | "collegiate";
  mileage: string;
  athletes: AthleteSpec[];
}

const FREE_TEAM: TeamSpec = {
  slug: "free",
  name: "Riverside XC",
  season: "Fall 2026",
  coach: { email: "coach.free@prform.test", name: "Dana Whitfield", age: 41 },
  entitlement: "FREE",
  athleteLevel: "high_school",
  mileage: "20-40",
  athletes: [
    { name: "Maya Ortiz",      age: 17, sex: "female", profile: "solid",    joinedDaysAgo: 21, targetHours: 9.0 },
    { name: "Ethan Kowalski",  age: 16, sex: "male",   profile: "solid",    joinedDaysAgo: 21, targetHours: 8.75 },
    { name: "Priya Raman",     age: 17, sex: "female", profile: "spotty",   joinedDaysAgo: 20, targetHours: 9.0 },
    { name: "Jonah Feldman",   age: 15, sex: "male",   profile: "slipping", joinedDaysAgo: 20, targetHours: 9.0 },
    { name: "Cassie Nguyen",   age: 18, sex: "female", profile: "short",    joinedDaysAgo: 19, targetHours: 8.5 },
    { name: "Theo Marsh",      age: 16, sex: "male",   profile: "silent",   joinedDaysAgo: 18, targetHours: 8.75 },
  ],
};

const PAID_TEAM: TeamSpec = {
  slug: "paid",
  name: "Summit Track Club",
  season: "Fall 2026",
  coach: { email: "coach.paid@prform.test", name: "Marcus Bell", age: 47 },
  entitlement: "PAID",
  athleteLevel: "collegiate",
  mileage: "40-60",
  athletes: [
    { name: "Lena Fischer",    age: 21, sex: "female", profile: "solid",    joinedDaysAgo: 30, targetHours: 8.5 },
    { name: "Darius Cole",     age: 22, sex: "male",   profile: "solid",    joinedDaysAgo: 30, targetHours: 8.25 },
    { name: "Aiko Tanaka",     age: 20, sex: "female", profile: "solid",    joinedDaysAgo: 29, targetHours: 8.75 },
    { name: "Sam Okafor",      age: 19, sex: "male",   profile: "solid",    joinedDaysAgo: 29, targetHours: 8.5 },
    { name: "Rosa Delgado",    age: 21, sex: "female", profile: "spotty",   joinedDaysAgo: 28, targetHours: 8.5 },
    { name: "Ben Halvorsen",   age: 23, sex: "male",   profile: "spotty",   joinedDaysAgo: 28, targetHours: 8.0 },
    { name: "Ines Moreau",     age: 20, sex: "female", profile: "slipping", joinedDaysAgo: 27, targetHours: 8.75 },
    { name: "Caleb Pratt",     age: 22, sex: "male",   profile: "slipping", joinedDaysAgo: 27, targetHours: 8.25 },
    { name: "Yara Haddad",     age: 19, sex: "female", profile: "short",    joinedDaysAgo: 26, targetHours: 8.5 },
    { name: "Owen Sato",       age: 21, sex: "male",   profile: "short",    joinedDaysAgo: 26, targetHours: 8.25 },
    { name: "Nadia Petrov",    age: 20, sex: "female", profile: "silent",   joinedDaysAgo: 25, targetHours: 8.5 },
    { name: "Miles Brennan",   age: 23, sex: "male",   profile: "silent",   joinedDaysAgo: 25, targetHours: 8.0 },
    { name: "Talia Reyes",     age: 19, sex: "female", profile: "solid",    joinedDaysAgo: 14, targetHours: 8.75 },
    { name: "Jude Achebe",     age: 20, sex: "male",   profile: "new",      joinedDaysAgo: 2,  targetHours: 8.5 },
  ],
};

// A week of coach-planned sessions, Monday first. Rest days are left out;
// the merge layer treats a day with no entry as rest already.
const WEEK_SESSIONS: Array<{
  dow: number;
  sessionType: string;
  durationMinutes: number;
  description?: string;
  targetPaces?: string;
} | null> = [
  { dow: 0, sessionType: "easy",       durationMinutes: 45, description: "Recovery run, conversational" },
  { dow: 1, sessionType: "track",      durationMinutes: 75, description: "6 x 800 with 400 jog", targetPaces: "5K pace" },
  { dow: 2, sessionType: "easy",       durationMinutes: 40 },
  { dow: 3, sessionType: "tempo",      durationMinutes: 60, description: "3 miles continuous", targetPaces: "Threshold" },
  { dow: 4, sessionType: "easy",       durationMinutes: 35, description: "Strides after" },
  { dow: 5, sessionType: "long_run",   durationMinutes: 90 },
  null,
];

// ── Helpers ──────────────────────────────────────────────────────────────────

// Deterministic, so a re-run rebuilds the same nights and the same colours.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** UTC midnight, matching how /api/sleep-log stores a night. */
function utcDay(daysFromToday: number): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysFromToday));
}

function parseTimeMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(min: number): string {
  const total = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function bedtimeFor(hours: number): string {
  return minutesToTime(parseTimeMin(WAKE) - hours * 60);
}

function slugName(name: string): string {
  return name.toLowerCase().replace(/[^a-z]+/g, ".");
}

// ── Nights ───────────────────────────────────────────────────────────────────

interface Night {
  nightsAgo: number;
  actualHours: number;
}

/** Which of the last 14 nights an athlete logged, and how long they slept. */
function nightsFor(spec: AthleteSpec, seedKey: string): Night[] {
  const rand = mulberry32(hashString(seedKey));
  const jitter = (spread: number) => (rand() * 2 - 1) * spread;
  const target = spec.targetHours;
  const nights: Night[] = [];

  // Nothing before the membership started: the leaderboard scores from the
  // join date, and a log from before it would read as a data error.
  const earliest = Math.min(14, spec.joinedDaysAgo);

  for (let n = earliest; n >= 1; n--) {
    switch (spec.profile) {
      case "solid":
        nights.push({ nightsAgo: n, actualHours: target + 0.1 + jitter(0.3) });
        break;
      case "spotty":
        if (rand() < 0.55) nights.push({ nightsAgo: n, actualHours: target + jitter(0.35) });
        break;
      case "slipping": {
        // Two short nights inside the 7-night window, the rest fine.
        const short = n === 2 || n === 5;
        nights.push({ nightsAgo: n, actualHours: short ? target - 1.0 - rand() * 0.4 : target + jitter(0.3) });
        break;
      }
      case "short": {
        // Five of the last seven short, and a slide before that.
        const short = n <= 7 ? n !== 3 && n !== 6 : rand() < 0.4;
        nights.push({ nightsAgo: n, actualHours: short ? target - 1.2 - rand() * 0.6 : target + jitter(0.25) });
        break;
      }
      case "silent":
        if (n >= 8) nights.push({ nightsAgo: n, actualHours: target + jitter(0.4) });
        break;
      case "new":
        if (n === 1) nights.push({ nightsAgo: n, actualHours: target + 0.2 });
        break;
    }
  }
  return nights;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function seedTeam(spec: TeamSpec, passwordHash: string) {
  const coach = await prisma.user.create({
    data: {
      email: spec.coach.email,
      password: passwordHash,
      name: spec.coach.name,
      age: spec.coach.age,
      biologicalSex: "male",
      weeklyMileage: "20-40",
      experienceLevel: "post_collegiate",
      currentWakeTime: "06:00",
      currentBedTime: "22:30",
      restedFeeling: "well",
      onboardingDone: true,
      onboardingCompletedAt: utcDay(-45),
      sport: "track",
      signupRole: "COACH",
      ageConfirmed: true,
      ageConfirmedAt: utcDay(-45),
      ianaTimezone: TZ,
    },
  });

  const paid = spec.entitlement === "PAID";
  const team = await prisma.team.create({
    data: {
      name: spec.name,
      sport: "track",
      season: spec.season,
      ownerId: coach.id,
      joinCode: generateJoinCode(),
      joinCodeExpiresAt: joinCodeExpiry(),
      entitlementSource: spec.entitlement,
      seatLimit: paid ? 40 : 8,
      ...(paid
        ? {
            stripeCustomerId: "cus_seed_summit_test",
            stripeSubscriptionId: "sub_seed_summit_test",
            subscriptionStatus: "active",
          }
        : {}),
    },
  });

  let logCount = 0;
  for (let i = 0; i < spec.athletes.length; i++) {
    const a = spec.athletes[i];
    const email = `${spec.slug}.${slugName(a.name)}@prform.test`;
    const joinedAt = utcDay(-a.joinedDaysAgo);
    const user = await prisma.user.create({
      data: {
        email,
        password: passwordHash,
        name: a.name,
        age: a.age,
        biologicalSex: a.sex,
        weeklyMileage: spec.mileage,
        experienceLevel: spec.athleteLevel,
        currentWakeTime: WAKE,
        currentBedTime: bedtimeFor(a.targetHours),
        restedFeeling: a.profile === "short" ? "rarely" : "sometimes",
        onboardingDone: true,
        onboardingCompletedAt: utcDay(-a.joinedDaysAgo - 1),
        sport: "track",
        signupRole: "ATHLETE",
        ageConfirmed: true,
        ageConfirmedAt: utcDay(-a.joinedDaysAgo - 1),
        ianaTimezone: TZ,
        createdAt: utcDay(-a.joinedDaysAgo - 1),
      },
    });

    await prisma.teamMembership.create({
      data: {
        teamId: team.id,
        userId: user.id,
        joinedAt,
        consentAt: joinedAt,
        consentText: TEAM_CONSENT_TEXT,
        status: "ACTIVE",
      },
    });

    const nights = nightsFor(a, `${spec.slug}:${i}:${a.name}`);
    if (nights.length > 0) {
      await prisma.sleepLog.createMany({
        data: nights.map((n) => {
          const actual = Math.round(n.actualHours * 4) / 4;
          return {
            userId: user.id,
            date: utcDay(-n.nightsAgo),
            recommendedBedtime: bedtimeFor(a.targetHours),
            recommendedWakeTime: WAKE,
            targetSleepHours: a.targetHours,
            hitTarget: actual >= a.targetHours - 0.25,
            actualBedtime: bedtimeFor(actual),
            actualWakeTime: WAKE,
            actualSleepHours: actual,
            source: "MANUAL" as const,
          };
        }),
      });
      logCount += nights.length;
    }
  }

  // Last week and next week of sessions, so both the coach's list and the
  // athletes' schedules have team entries either side of today. UTC midnight,
  // which is what the sessions route stores from a "YYYY-MM-DD" body.
  const currentDow = (utcDay(0).getUTCDay() + 6) % 7; // 0 = Monday
  const sessions = [];
  for (let offset = -7; offset <= 7; offset++) {
    const s = WEEK_SESSIONS[(((currentDow + offset) % 7) + 7) % 7];
    if (!s) continue;
    sessions.push({
      teamId: team.id,
      date: utcDay(offset),
      sessionType: s.sessionType,
      durationMinutes: s.durationMinutes,
      description: s.description ?? null,
      targetPaces: s.targetPaces ?? null,
    });
  }
  await prisma.plannedSession.createMany({ data: sessions });

  console.log(`✓ ${spec.name} (${spec.entitlement})`);
  console.log(`    coach     ${spec.coach.email} / ${PASSWORD}`);
  console.log(`    join code ${team.joinCode}`);
  console.log(`    athletes  ${spec.athletes.length}, ${logCount} sleep logs, ${sessions.length} planned sessions`);
  for (const a of spec.athletes) {
    console.log(`      ${a.name.padEnd(16)} ${a.profile.padEnd(9)} ${spec.slug}.${slugName(a.name)}@prform.test`);
  }
}

async function main() {
  const specs = [FREE_TEAM, PAID_TEAM];
  const emails = specs.flatMap((t) => [
    t.coach.email,
    ...t.athletes.map((a) => `${t.slug}.${slugName(a.name)}@prform.test`),
  ]);

  const existing = await prisma.user.count({ where: { email: { in: emails } } });
  if (existing > 0) {
    console.log(`Removing ${existing} existing seed account(s) and everything they own...`);
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
  }

  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  for (const spec of specs) await seedTeam(spec, passwordHash);

  console.log(`\nAll accounts use the password ${PASSWORD}.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
