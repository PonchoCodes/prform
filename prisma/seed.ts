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

async function main() {
  console.log("Seeding database...");

  const existing = await prisma.user.findUnique({ where: { email: "demo@prform.com" } });
  if (existing) {
    console.log("Demo user already exists. Deleting and re-seeding...");
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
      { userId: user.id, name: "State Championships", date: meetA, distances: "5K, 10K", priority: "A" },
      { userId: user.id, name: "Local Invitational", date: meetB, distances: "5K", priority: "B" },
      { userId: user.id, name: "Regional Open", date: meetC, distances: "10K", priority: "C" },
    ],
  });

  console.log("✓ Seed complete. Demo: demo@prform.com / demo1234");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
