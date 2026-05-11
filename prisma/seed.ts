import { PrismaClient } from "@prisma/client";
import { neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import bcrypt from "bcryptjs";
import ws from "ws";
import "dotenv/config";

neonConfig.webSocketConstructor = ws;

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const WORKOUT_SCHEDULE: Array<{ dow: number; type: string; distance: number | null }> = [
  { dow: 0, type: "easy", distance: 6 },
  { dow: 1, type: "moderate", distance: 8 },
  { dow: 2, type: "tempo", distance: 7 },
  { dow: 3, type: "easy", distance: 5 },
  { dow: 4, type: "rest", distance: null },
  { dow: 5, type: "long_run", distance: 14 },
  { dow: 6, type: "cross_train", distance: null },
];

function parseTimeMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(min: number): string {
  const total = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function computeSleepHours(bedtime: string, waketime: string): number {
  return ((parseTimeMin(waketime) - parseTimeMin(bedtime) + 1440) % 1440) / 60;
}

async function main() {
  console.log("Seeding database...");

  const existing = await prisma.user.findUnique({ where: { email: "demo@prform.com" } });
  if (existing) {
    console.log("Demo user already exists. Deleting and re-seeding...");
    await prisma.sleepLog.deleteMany({ where: { userId: existing.id } });
    await prisma.workout.deleteMany({ where: { userId: existing.id } });
    await prisma.meet.deleteMany({ where: { userId: existing.id } });
    await prisma.session.deleteMany({ where: { userId: existing.id } });
    await prisma.user.delete({ where: { id: existing.id } });
  }

  const password = await bcrypt.hash("demo1234", 12);

  const user = await prisma.user.create({
    data: {
      email: "demo@prform.com",
      password,
      name: "Alex Runner",
      age: 24,
      biologicalSex: "male",
      weeklyMileage: "50-70",
      experienceLevel: "post_collegiate",
      currentWakeTime: "06:00",
      currentBedTime: "22:30",
      restedFeeling: "sometimes",
      onboardingDone: true,
      sport: "track",
      planAggressiveness: 85,         // collegiate default (post_collegiate would be 100 but demo is 85)
      bedtimeAdjustmentMinutes: 0,
    },
  });

  await prisma.workout.createMany({
    data: WORKOUT_SCHEDULE.map((w) => ({
      userId: user.id,
      date: new Date(0),
      type: w.type,
      distance: w.distance,
      isTemplate: true,
      dayOfWeek: w.dow,
    })),
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const historicalWorkouts = [];
  for (let week = -8; week < 0; week++) {
    for (const w of WORKOUT_SCHEDULE) {
      const date = new Date(today);
      const currentDow = (today.getDay() + 6) % 7;
      let diff = w.dow - currentDow;
      if (diff < 0) diff += 7;
      date.setDate(today.getDate() + diff + week * 7);
      if (date >= today) continue;
      historicalWorkouts.push({
        userId: user.id,
        date,
        type: w.type,
        distance: w.distance,
        isTemplate: false,
        effort: w.type === "rest" ? null : Math.floor(Math.random() * 3) + 1,
      });
    }
  }
  if (historicalWorkouts.length > 0) {
    await prisma.workout.createMany({ data: historicalWorkouts });
  }

  const meetA = new Date(today);
  meetA.setDate(today.getDate() + 18);
  const meetB = new Date(today);
  meetB.setDate(today.getDate() + 6);
  const meetC = new Date(today);
  meetC.setDate(today.getDate() + 45);

  await prisma.meet.createMany({
    data: [
      { userId: user.id, name: "State Championships", date: meetA, distances: "5K, 10K", priority: "A", raceTime: "09:00" },
      { userId: user.id, name: "Local Invitational", date: meetB, distances: "5K", priority: "B", raceTime: "10:30" },
      { userId: user.id, name: "Regional Open", date: meetC, distances: "10K", priority: "C", raceTime: "14:00" },
    ],
  });

  // Planned future workouts
  const plannedWorkouts = [];
  for (const w of WORKOUT_SCHEDULE) {
    if (w.type === "rest") continue;
    const date = new Date(today);
    const currentDow = (today.getDay() + 6) % 7;
    let diff = w.dow - currentDow;
    if (diff <= 0) diff += 7;
    date.setDate(today.getDate() + diff);
    plannedWorkouts.push({
      userId: user.id,
      date,
      type: w.type,
      distance: w.distance,
      isTemplate: false,
      isTentative: true,
    });
  }
  if (plannedWorkouts.length > 0) {
    await prisma.workout.createMany({ data: plannedWorkouts });
  }

  // ── SleepLog seed data ───────────────────────────────────────────────────────
  // 14 nights: nights -13 through -1 (yesterday)
  // Layout: nights -13 to -8: 6 hit nights, -7 to -6: 2 hit nights,
  //         -5 to -4: 2 unlogged (no record), -3 to -2: 2 miss nights (early, before 4 consecutive),
  //         actually let's do: -13 to -5 = 8 hit, -4 to -3 = unlogged, -2 to yesterday = 4 consecutive misses
  // That gives consecutiveMisses = 4 (>= 3 triggers intervention on next dashboard load)

  const recommendedBedtime = "22:30"; // user's base bedtime
  const wakeTime = "06:00";
  const sleepLogs = [];

  // Nights -13 to -6: hit target (8 nights)
  for (let i = 13; i >= 6; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    d.setHours(0, 0, 0, 0);
    sleepLogs.push({
      userId: user.id,
      date: d,
      recommendedBedtime,
      hitTarget: true,
      actualBedtime: recommendedBedtime,
      actualWakeTime: wakeTime,
      actualSleepHours: computeSleepHours(recommendedBedtime, wakeTime),
      source: "manual",
    });
  }

  // Nights -5 and -4: UNLOGGED — skip (no record created)

  // Nights -3 to yesterday (-1): 4 consecutive misses (~30 min late each)
  const missedBedtimes = ["22:58", "23:05", "23:02", "23:10"];
  for (let i = 0; i < 4; i++) {
    const nightOffset = 4 - i; // 4, 3, 2, 1
    const d = new Date(today);
    d.setDate(today.getDate() - nightOffset);
    d.setHours(0, 0, 0, 0);
    const actualBedtime = missedBedtimes[i];
    sleepLogs.push({
      userId: user.id,
      date: d,
      recommendedBedtime,
      hitTarget: false,
      actualBedtime,
      actualWakeTime: wakeTime,
      actualSleepHours: computeSleepHours(actualBedtime, wakeTime),
      source: "manual",
    });
  }

  if (sleepLogs.length > 0) {
    await prisma.sleepLog.createMany({ data: sleepLogs });
  }

  console.log("✓ Seed complete. Demo: demo@prform.com / demo1234");
  console.log(`  - ${sleepLogs.length} sleep logs created (8 hit, 4 consecutive misses, 2 unlogged)`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
