export type WorkoutType =
  | "easy"
  | "moderate"
  | "tempo"
  | "long_run"
  | "track"
  | "race"
  | "rest"
  | "cross_train";

export interface WorkoutInput {
  date: Date;
  type: WorkoutType;
}

export interface MeetInput {
  date: Date;
  priority: "A" | "B" | "C";
  name: string;
  raceTime?: string | null;
}

export interface UserInput {
  age: number;
  biologicalSex: string;
  currentWakeTime: string; // "HH:MM" 24h
  currentBedTime: string;  // "HH:MM" 24h
  sport?: string;
}

export interface WindDownPhases {
  phase1: string; // "HH:MM" 24h, 2 hours before bed
  phase2: string; // 90 min before
  phase3: string; // 30 min before
  phase4: string; // 15 min before
}

export interface DailySleepPlan {
  date: Date;
  recommendedBedtime: string;   // "HH:MM" 24h
  recommendedWakeTime: string;  // "HH:MM" 24h
  totalSleepHours: number;
  trainingLoadLevel: "low" | "medium" | "high";
  daysUntilNextMeet: number | null;
  nextMeetName: string | null;
  nextMeetPriority: "A" | "B" | "C" | null;
  recoveryScore: number;
  windDown: WindDownPhases;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(minutes: number): string {
  const total = ((minutes % 1440) + 1440) % 1440;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function baseSleepMinutes(age: number, sex: string, sport?: string): number {
  let base = 8.0;
  if (age >= 13 && age <= 17) base = 9.0;
  else if (age >= 18 && age <= 25) base = 8.5;
  if (sex === "female") base += 0.5;
  if (sport === "swimming") return base * 60 + 20;
  return base * 60;
}

function trainingLoadExtra(type: WorkoutType): number {
  if (type === "moderate") return 15;
  if (type === "tempo" || type === "track") return 20;
  if (type === "long_run") return 30;
  return 0;
}

function isHardWorkout(type: WorkoutType): boolean {
  return type === "tempo" || type === "track" || type === "long_run" || type === "race";
}

function trainingLoadLevel(type: WorkoutType): "low" | "medium" | "high" {
  if (type === "rest" || type === "easy" || type === "cross_train") return "low";
  if (type === "moderate") return "medium";
  return "high";
}

function daysApart(a: Date, b: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.round((b.getTime() - a.getTime()) / msPerDay);
}

function raceTimeShiftFraction(daysOut: number): number {
  if (daysOut >= 8 && daysOut <= 10) return 0.10;
  if (daysOut >= 5 && daysOut <= 7) return 0.25;
  if (daysOut >= 2 && daysOut <= 4) return 0.40;
  if (daysOut === 1) return 0.25;
  return 0;
}

export function computeRaceTimeShift(
  raceTime: string | null,
  wakeTime: string,
  priority: "A" | "B" | "C"
): number {
  if (!raceTime) return 0;

  const [wh, wm] = wakeTime.split(":").map(Number);
  const wakeHour = wh + wm / 60;
  const [rh, rm] = raceTime.split(":").map(Number);
  const raceHour = rh + rm / 60;

  const tmin = ((wakeHour - 2) + 24) % 24;
  const naturalPeak = (tmin + 11) % 24;

  const requiredAdvance = naturalPeak - raceHour;
  if (requiredAdvance <= 0) return 0;

  let advanceMinutes = requiredAdvance * 60;
  const scale = priority === "A" ? 1.0 : priority === "B" ? 0.75 : 0.5;
  advanceMinutes *= scale;

  return Math.min(advanceMinutes, 90);
}

function preMeetShiftMinutes(daysOut: number, priority: "A" | "B" | "C"): number {
  let shift = 0;
  if (daysOut >= 10 && daysOut <= 8) shift = 15;
  else if (daysOut >= 5 && daysOut <= 7) shift = 30;
  else if (daysOut >= 2 && daysOut <= 4) shift = 45;
  else if (daysOut === 1) shift = 60;

  if (priority === "B") shift = Math.round(shift * 0.75);
  if (priority === "C") shift = Math.round(shift * 0.5);
  return shift;
}

export function calculateSleepPlan(
  user: UserInput,
  workouts: WorkoutInput[],
  meets: MeetInput[]
): DailySleepPlan[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const wakeMinutes = timeToMinutes(user.currentWakeTime);
  const baseMinutes = baseSleepMinutes(user.age, user.biologicalSex, user.sport);

  // Build a date→workout map
  const workoutMap = new Map<string, WorkoutInput>();
  for (const w of workouts) {
    const d = new Date(w.date);
    d.setHours(0, 0, 0, 0);
    workoutMap.set(d.toISOString(), w);
  }

  // Sort meets by date
  const futureMeets = meets
    .map((m) => ({ ...m, date: new Date(m.date) }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  const plans: DailySleepPlan[] = [];

  for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
    const date = new Date(today);
    date.setDate(today.getDate() + dayOffset);
    date.setHours(0, 0, 0, 0);

    const dateKey = date.toISOString();
    const workout = workoutMap.get(dateKey);
    const workoutType: WorkoutType = workout?.type as WorkoutType ?? "rest";

    // Yesterday's workout
    const yesterday = new Date(date);
    yesterday.setDate(date.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    const yesterdayWorkout = workoutMap.get(yesterday.toISOString());
    const dayAfterHardBonus =
      yesterdayWorkout && isHardWorkout(yesterdayWorkout.type as WorkoutType) ? 15 : 0;

    // Total sleep need in minutes
    let sleepNeed = baseMinutes + trainingLoadExtra(workoutType) + dayAfterHardBonus;

    // Next meet
    const nextMeet = futureMeets.find((m) => m.date >= date) ?? null;
    const daysUntilNextMeet = nextMeet ? daysApart(date, nextMeet.date) : null;

    // Pre-meet shift (base + race-time-adjusted advance)
    let shiftMinutes = 0;
    for (const meet of futureMeets) {
      const daysOut = daysApart(date, meet.date);
      if (daysOut >= 1 && daysOut <= 10) {
        const baseShift = preMeetShiftMinutes(daysOut, meet.priority);
        const totalRaceShift = computeRaceTimeShift(meet.raceTime ?? null, user.currentWakeTime, meet.priority);
        const raceShift = Math.round(totalRaceShift * raceTimeShiftFraction(daysOut));
        const totalShift = baseShift + raceShift;
        if (totalShift > shiftMinutes) shiftMinutes = totalShift;
      }
    }

    // Bedtime = wakeTime - sleepNeed, then shift earlier
    const bedtimeMinutes = wakeMinutes - sleepNeed - shiftMinutes;
    const recommendedBedtime = minutesToTime(bedtimeMinutes);
    const recommendedWakeTime = minutesToTime(wakeMinutes);
    const totalSleepHours = Math.round((sleepNeed / 60) * 10) / 10;

    // Wind-down phases
    const windDown: WindDownPhases = {
      phase1: minutesToTime(bedtimeMinutes - 120),
      phase2: minutesToTime(bedtimeMinutes - 90),
      phase3: minutesToTime(bedtimeMinutes - 30),
      phase4: minutesToTime(bedtimeMinutes - 15),
    };

    // Recovery score
    let recovery = 100;
    let consecutiveHard = 0;
    for (let i = 0; i < dayOffset; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      d.setHours(0, 0, 0, 0);
      const w = workoutMap.get(d.toISOString());
      if (w && isHardWorkout(w.type as WorkoutType)) {
        consecutiveHard++;
      } else {
        consecutiveHard = 0;
      }
    }
    recovery -= consecutiveHard * 5;

    if (daysUntilNextMeet !== null && daysUntilNextMeet <= 3) recovery -= 10;

    // Sleep deficit vs baseline
    const baselineSleep =
      ((wakeMinutes - timeToMinutes(user.currentBedTime) + 1440) % 1440) / 60;
    const deficit = Math.max(0, baselineSleep - totalSleepHours);
    recovery -= Math.round(deficit * 3);

    // Rest days in past 3 days
    for (let i = Math.max(0, dayOffset - 3); i < dayOffset; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      d.setHours(0, 0, 0, 0);
      const w = workoutMap.get(d.toISOString());
      if (!w || w.type === "rest") recovery += 5;
    }

    recovery = Math.max(0, Math.min(100, recovery));

    plans.push({
      date,
      recommendedBedtime,
      recommendedWakeTime,
      totalSleepHours,
      trainingLoadLevel: trainingLoadLevel(workoutType),
      daysUntilNextMeet,
      nextMeetName: nextMeet?.name ?? null,
      nextMeetPriority: nextMeet?.priority ?? null,
      recoveryScore: recovery,
      windDown,
    });
  }

  return plans;
}

export function formatTime12h(time24: string): string {
  const [h, m] = time24.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}
