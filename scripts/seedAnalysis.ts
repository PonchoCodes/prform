import { PrismaClient } from "@prisma/client";
import { neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import ws from "ws";
import "dotenv/config";

neonConfig.webSocketConstructor = ws;
const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// Weekly training pattern for a 24yo male runner (VDOT ~58, maxHR 196).
// Zone boundaries (by avgHR): Z1 < 150.9, Z2 150.9-174.4, Z3 >= 174.4.
// Pattern is polarized: Z1 easy/long/moderate, Z3 interval/tempo, no Z2.
type Pattern = {
  name: string;
  distanceM: number;
  speedMs: number;  // m/s
  avgHR: number;
  maxHR: number;
  suffer: number;
};

// DOW 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
const WEEK: Record<number, Pattern | null> = {
  0: { name: "Easy Run",      distanceM: 6000,  speedMs: 3.00, avgHR: 143, maxHR: 152, suffer: 35 },  // Z1
  1: { name: "Morning Run",   distanceM: 9000,  speedMs: 3.20, avgHR: 148, maxHR: 157, suffer: 45 },  // Z1
  2: { name: "Track Workout", distanceM: 6000,  speedMs: 4.20, avgHR: 183, maxHR: 193, suffer: 85 },  // Z3
  3: { name: "Easy Run",      distanceM: 6000,  speedMs: 3.00, avgHR: 143, maxHR: 152, suffer: 35 },  // Z1
  4: null,                                                                                              // Rest
  5: { name: "Long Run",      distanceM: 14000, speedMs: 3.05, avgHR: 148, maxHR: 157, suffer: 65 },  // Z1
  6: { name: "Tempo Run",     distanceM: 7000,  speedMs: 3.85, avgHR: 177, maxHR: 187, suffer: 80 },  // Z3
};

// 5K time trial placed at daysBack=5. sufferScore=145 exceeds p90 (~85), making it the
// VDOT reference run. calcVDOT(5000, 1050) ≈ 58.2.
const TIME_TRIAL: Pattern & { workoutType?: number } = {
  name: "Track Time Trial 5K",
  distanceM: 5000,
  speedMs: 4.762,
  avgHR: 191,
  maxHR: 195,
  suffer: 145,
};

function rnd(val: number, jitterPct: number): number {
  return val * (1 + (Math.random() * 2 - 1) * jitterPct);
}

async function main() {
  const user = await prisma.user.findUnique({ where: { email: "demo@prform.com" } });
  if (!user) {
    console.error("Demo user not found. Run `npm run seed` first.");
    process.exit(1);
  }

  await prisma.stravaActivity.deleteMany({ where: { userId: user.id } });
  await prisma.user.update({
    where: { id: user.id },
    data: { stravaConnected: true, stravaAthleteId: "demo-athlete-12345" },
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Hit-night run dates: run is on the day AFTER a hit-logged night.
  // Hit nights = today-13 through today-6. Runs = today-12 through today-5.
  const hitRunDates = new Set<string>();
  for (let i = 12; i >= 5; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    hitRunDates.add(d.toISOString().slice(0, 10));
  }

  // Miss-night run dates: run is on the day AFTER a miss-logged night.
  // Miss nights = today-4 through today-1. Runs = today-3 through today.
  const missRunDates = new Set<string>();
  for (let i = 3; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    missRunDates.add(d.toISOString().slice(0, 10));
  }

  const acts: object[] = [];
  let idSeq = 10_000_000;
  const DAYS_BACK = 132; // 90-day window + 42-day PMC warmup

  for (let daysBack = DAYS_BACK; daysBack >= 0; daysBack--) {
    const d = new Date(today);
    d.setDate(today.getDate() - daysBack);
    const dateStr = d.toISOString().slice(0, 10);
    const dow = d.getDay();
    d.setHours(9, 0, 0, 0); // 9 AM start

    // Replace the track session 5 days ago with a 5K time trial.
    if (daysBack === 5) {
      const movingTime = Math.round(TIME_TRIAL.distanceM / TIME_TRIAL.speedMs);
      acts.push({
        stravaId: String(idSeq++),
        userId: user.id,
        name: TIME_TRIAL.name,
        startDate: new Date(d),
        distance: TIME_TRIAL.distanceM,
        movingTime,
        elapsedTime: movingTime + 300,
        totalElevGain: 5,
        averageSpeed: TIME_TRIAL.speedMs,
        maxSpeed: Math.round(TIME_TRIAL.speedMs * 1.07 * 100) / 100,
        averageHeartrate: TIME_TRIAL.avgHR,
        maxHeartrate: TIME_TRIAL.maxHR,
        sufferScore: TIME_TRIAL.suffer,
      });
      continue;
    }

    const pattern = WEEK[dow];
    if (!pattern) continue; // rest day

    // Apply a subtle speed offset on days paired with logged sleep nights so the
    // scatter chart shows a visible (negative) correlation between sleep adherence
    // and running pace.
    let mult = 1.0;
    if (hitRunDates.has(dateStr)) mult = 1.03;
    if (missRunDates.has(dateStr)) mult = 0.96;

    const speed   = Math.round(rnd(pattern.speedMs * mult, 0.02) * 1000) / 1000;
    const dist    = Math.round(rnd(pattern.distanceM, 0.04));
    const movTime = Math.round(dist / speed);
    const avgHR   = Math.round(rnd(pattern.avgHR, 0.015));
    const maxHR   = Math.max(avgHR + 5, Math.round(rnd(pattern.maxHR, 0.01)));
    const suffer  = Math.round(rnd(pattern.suffer, 0.08));

    acts.push({
      stravaId: String(idSeq++),
      userId: user.id,
      name: pattern.name,
      startDate: new Date(d),
      distance: dist,
      movingTime: movTime,
      elapsedTime: movTime + Math.round(rnd(280, 0.4)),
      totalElevGain: Math.round(rnd(20, 0.6)),
      averageSpeed: speed,
      maxSpeed: Math.round(speed * 1.15 * 100) / 100,
      averageHeartrate: avgHR,
      maxHeartrate: maxHR,
      sufferScore: suffer,
    });
  }

  const CHUNK = 50;
  for (let i = 0; i < acts.length; i += CHUNK) {
    await prisma.stravaActivity.createMany({ data: acts.slice(i, i + CHUNK) as any });
  }

  const trialDate = new Date(today);
  trialDate.setDate(today.getDate() - 5);

  console.log(`✓ Seeded ${acts.length} Strava activities for demo@prform.com`);
  console.log(`  stravaConnected = true`);
  console.log(`  Time trial (VDOT ref): ${trialDate.toISOString().slice(0, 10)}`);
  console.log(`  Hit-night run pairs: ${Array.from(hitRunDates).sort().join(", ")}`);
  console.log(`  Miss-night run pairs: ${Array.from(missRunDates).sort().join(", ")}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
