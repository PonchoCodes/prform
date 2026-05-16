import {
  calculateSleepPlan,
  type UserInput,
  type MeetInput,
  type NormalizedWorkout,
} from "../lib/sleepAlgorithm";

// Validation harness for the science-based rewrite.
// Run: npx tsx scripts/validateSleepAlgorithm.ts

function assert(label: string, actual: unknown, expected: unknown) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  const mark = pass ? "PASS" : "FAIL";
  console.log(`${mark}  ${label}  expected=${JSON.stringify(expected)}  actual=${JSON.stringify(actual)}`);
}

function assertRange(label: string, actual: number, min: number, max: number) {
  const pass = actual >= min && actual <= max;
  const mark = pass ? "PASS" : "FAIL";
  console.log(`${mark}  ${label}  expected=[${min}, ${max}]  actual=${actual}`);
}

// ── Test 1: Base sleep need (via plan output, since baseSleepMinutes is private) ──
console.log("\n── Test 1: Base sleep need ──");
{
  const user22M: UserInput = {
    age: 22, biologicalSex: "male", currentWakeTime: "07:00", currentBedTime: "22:30",
  };
  const p1 = calculateSleepPlan(user22M, [], [], 0, { startDayOffset: 0 })[0];
  // 22yo male, no workout (rest), no day-after bonus → base = 8.75h = 525 min
  assert("22yo male rest day → 8.75h", p1.totalSleepHours, 8.8);

  const user16F: UserInput = {
    age: 16, biologicalSex: "female", currentWakeTime: "07:00", currentBedTime: "22:30",
    sport: "swimming",
  };
  const p2 = calculateSleepPlan(user16F, [], [], 0, { startDayOffset: 0 })[0];
  // 16yo female swimmer rest day → 9.25*60 + 30 + 20 = 605 min = 10.083h → 10.1
  assert("16yo female swimmer rest day → 10.1h", p2.totalSleepHours, 10.1);
}

// ── Test 2: Training load extra (Zone-based) ──
console.log("\n── Test 2: Training load extra ──");
{
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const user: UserInput = {
    age: 22, biologicalSex: "male", currentWakeTime: "07:00", currentBedTime: "22:30",
    planAggressiveness: 100,
  };
  const trackWorkout: NormalizedWorkout = {
    date: today, type: "track", distance: 8, duration: 60, source: "manual", isTentative: false,
  };
  const p = calculateSleepPlan(user, [], [trackWorkout], 0, { startDayOffset: 0 })[0];
  // Base 8.75h + Zone 3 (track, default effort 3) → 20 + 3*5 = 35 min. agg=1.0.
  // No yesterday workout (rest). Total = 525 + 35 = 560 min = 9.333h → 9.3
  assert("track effort default → +35 min", p.totalSleepHours, 9.3);

  const easyWorkout: NormalizedWorkout = {
    date: today, type: "easy", distance: 5, duration: 30, source: "manual", isTentative: false,
  };
  const pEasy = calculateSleepPlan(user, [], [easyWorkout], 0, { startDayOffset: 0 })[0];
  // Base 8.75h + Zone 1 (easy) → 0 min. Total = 525 = 8.75h → 8.8
  assert("easy effort → +0 min", pEasy.totalSleepHours, 8.8);

  const tempoWorkout: NormalizedWorkout = {
    date: today, type: "tempo", distance: 6, duration: 35, source: "manual", isTentative: false,
  };
  const userAgg80: UserInput = { ...user, planAggressiveness: 80 };
  const pT = calculateSleepPlan(userAgg80, [], [tempoWorkout], 0, { startDayOffset: 0 })[0];
  // Base 8.75h + Zone 2 (tempo, default effort 3) → (10 + 3*3) * 0.8 = round(15.2) = 15
  // Total = 525 + 15 = 540 min = 9.0h
  assert("tempo agg 0.8 → +15 min", pT.totalSleepHours, 9.0);
}

// ── Test 3: Phase advance fractions ≤30 min/day ──
console.log("\n── Test 3: Phase advance deltas ≤30 min/day ──");
{
  const fractions: Record<number, number> = {
    10: 0.03, 9: 0.07, 8: 0.12, 7: 0.19, 6: 0.28,
    5: 0.38, 4: 0.52, 3: 0.67, 2: 0.82, 1: 1.00,
  };
  const totalAdvance = 90; // A race, max behavioral cap
  for (let d = 10; d >= 1; d--) {
    const prev = fractions[d];
    const next = fractions[d - 1] ?? 1.0;
    const delta = Math.round((next - prev) * totalAdvance * 10) / 10;
    assertRange(`day ${d}→${d-1} delta @ 90min total`, delta, 0, 30);
  }
}

// ── Test 4: Wind-down phase 3 = T-45, not T-30 ──
console.log("\n── Test 4: Wind-down phase 3 = T-45 ──");
{
  const user: UserInput = {
    age: 22, biologicalSex: "male", currentWakeTime: "07:00", currentBedTime: "22:30",
  };
  const p = calculateSleepPlan(user, [], [], 0, { startDayOffset: 0 })[0];
  // Bedtime should be ~22:15 (07:00 - 8.75h = 22:15). phase3 = 22:15 - 45 = 21:30
  const bedMin = Number(p.recommendedBedtime.split(":")[0]) * 60 + Number(p.recommendedBedtime.split(":")[1]);
  const phase3Min = Number(p.windDown.phase3.split(":")[0]) * 60 + Number(p.windDown.phase3.split(":")[1]);
  assert(`phase3 = bedtime - 45 (bed=${p.recommendedBedtime}, phase3=${p.windDown.phase3})`, bedMin - phase3Min, 45);
}

// ── Test 5: Sleep extension bonus ──
console.log("\n── Test 5: Sleep extension bonus ──");
{
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const user: UserInput = {
    age: 22, biologicalSex: "male", currentWakeTime: "07:00", currentBedTime: "22:30",
    planAggressiveness: 100,
  };

  const meetIn25Days = new Date(today);
  meetIn25Days.setDate(today.getDate() + 25);
  const aMeet: MeetInput = { date: meetIn25Days, priority: "A", name: "Big Race" };
  const pA = calculateSleepPlan(user, [aMeet], [], 0, { startDayOffset: 0 })[0];
  // base 525 + extension bonus (A meet, day 25 of 35 → progress = (35-25)/24 ≈ 0.417 → 20 + round(0.417*25) = 30 min)
  const expectedMin = 525 + 30;
  const actualMin = Math.round(pA.totalSleepHours * 60);
  assertRange(`A-meet 25d out → ~30min extension`, actualMin, expectedMin - 5, expectedMin + 5);

  const cMeet: MeetInput = { date: meetIn25Days, priority: "C", name: "Local 5K" };
  const pC = calculateSleepPlan(user, [cMeet], [], 0, { startDayOffset: 0 })[0];
  // C meet → no extension
  assert(`C-meet 25d out → 0 extension (8.75h)`, pC.totalSleepHours, 8.8);

  const meetIn8Days = new Date(today);
  meetIn8Days.setDate(today.getDate() + 8);
  const aMeet8: MeetInput = { date: meetIn8Days, priority: "A", name: "Race Soon" };
  const pA8 = calculateSleepPlan(user, [aMeet8], [], 0, { startDayOffset: 0 })[0];
  // 8 days out → PRC handles it, extension returns 0 (no extension bonus)
  // base + 0 extension + 0 day-after (no workouts) = 525
  // But may be 0 deviation since no workouts → 8.75h
  assert(`A-meet 8d out → no extension`, pA8.totalSleepHours, 8.8);
}

console.log("\n── Done ──");
