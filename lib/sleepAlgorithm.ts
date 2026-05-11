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

export interface LightExposure {
  start: string;      // "HH:MM" 24h
  end: string;        // "HH:MM" 24h
  durationMin: number;
  type: "outdoor" | "10000lux";
  instruction: string;
}

// Phase Response Curve plan — one per day during a circadian shift window
export interface CircadianPlan {
  cbtMin: string;             // core body temperature minimum — the PRC anchor
  advanceWindowStart: string; // = cbtMin (light here advances the clock)
  advanceWindowEnd: string;   // cbtMin + 4h (advance zone boundary)
  delayZoneEnd: string;       // = cbtMin (light before this delays the clock)
  lightExposure: LightExposure; // prescribed advance-zone exposure
  lightAvoidStart: string;    // dim all lights after this time (pre-bed delay zone)
  dailyShiftMin: number;      // minutes shifted today vs yesterday
  cumulativeShiftMin: number; // total advance applied so far vs baseline
  targetWakeTime: string;     // final target once shift is complete
  mechanismNote: string;      // one-line science rationale
}

export interface DailySleepPlan {
  date: Date;
  recommendedBedtime: string;  // "HH:MM" 24h
  recommendedWakeTime: string; // "HH:MM" 24h — shifts earlier during advance window
  totalSleepHours: number;
  trainingLoadLevel: "low" | "medium" | "high";
  daysUntilNextMeet: number | null;
  nextMeetName: string | null;
  nextMeetPriority: "A" | "B" | "C" | null;
  recoveryScore: number;
  windDown: WindDownPhases;
  circadian: CircadianPlan | null; // null when no meet within shift window
  fatigueSleepBoost: boolean;
  fatigueSleepBoostMinutes: number;
}

// ── helpers ──────────────────────────────────────────────────────────────────

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

// ── PRC engine ────────────────────────────────────────────────────────────────

interface MeetShiftSchedule {
  meet: MeetInput & { date: Date };
  targetWakeMinutes: number;
  totalAdvanceMin: number;
  actualDailyRateMin: number;
  shiftWindowDays: number;
}

function buildMeetShiftSchedule(
  meet: MeetInput & { date: Date },
  baseWakeMinutes: number,
): MeetShiftSchedule {
  let targetWakeMinutes: number;

  if (meet.raceTime) {
    const raceMin = timeToMinutes(meet.raceTime);
    // Wake 2h before race start — enough time to warm up and reach alertness
    targetWakeMinutes = raceMin - 120;
  } else {
    // No race time: apply a default advance scaled to priority
    const defaultAdv = meet.priority === "A" ? 30 : meet.priority === "B" ? 15 : 0;
    targetWakeMinutes = baseWakeMinutes - defaultAdv;
  }

  // Positive = we need to advance (wake earlier). Cap at 90 min — beyond that
  // requires weeks, not days.
  const totalAdvanceMin = Math.max(0, Math.min(90, baseWakeMinutes - targetWakeMinutes));

  // Max shift per day by priority. PRC literature supports 15–90 min/day;
  // these are sustainable rates that preserve sleep architecture.
  const maxDailyRate = meet.priority === "A" ? 30 : meet.priority === "B" ? 20 : 15;

  const shiftWindowDays =
    totalAdvanceMin > 0 ? Math.min(10, Math.ceil(totalAdvanceMin / maxDailyRate)) : 0;

  // Spread evenly so the athlete's sleep shifts smoothly
  const actualDailyRateMin = shiftWindowDays > 0 ? totalAdvanceMin / shiftWindowDays : 0;

  return {
    meet,
    targetWakeMinutes,
    totalAdvanceMin,
    actualDailyRateMin,
    shiftWindowDays,
  };
}

function computePRCPlan(
  dayWakeMinutes: number,
  dayBedMinutes: number,
  dailyShiftMin: number,
  cumulativeShiftMin: number,
  targetWakeTime: string,
): CircadianPlan {
  // CBTmin: 2.5h before wake (midpoint of 2–3h empirical window)
  // This is the PRC anchor — the circadian pacemaker's reference point
  const cbtMinutes = ((dayWakeMinutes - 150) % 1440 + 1440) % 1440;

  // Advance window runs from CBTmin to +4h (where PRC advances are largest)
  const advanceEndMinutes = cbtMinutes + 240;

  // Light exposure: 45 min starting at CBTmin (maximal advance zone)
  const lightStartMinutes = cbtMinutes;
  const lightEndMinutes = cbtMinutes + 45;
  const cbtHour = cbtMinutes / 60;

  // Before 6 AM it's dark — prescribe a light therapy lamp instead of outdoor
  const useOutdoor = cbtHour >= 6.0;

  const lightExposure: LightExposure = {
    start: minutesToTime(lightStartMinutes),
    end: minutesToTime(lightEndMinutes),
    durationMin: 45,
    type: useOutdoor ? "outdoor" : "10000lux",
    instruction: useOutdoor
      ? "45 min outdoor sunlight, no sunglasses. Stand in direct light, not shade."
      : "45 min at a 10,000 lux light therapy lamp — too early for outdoor sun.",
  };

  // Light avoidance starts 3h before bed (melatonin onset window)
  const lightAvoidMinutes = ((dayBedMinutes - 180) % 1440 + 1440) % 1440;

  return {
    cbtMin: minutesToTime(cbtMinutes),
    advanceWindowStart: minutesToTime(cbtMinutes),
    advanceWindowEnd: minutesToTime(advanceEndMinutes),
    delayZoneEnd: minutesToTime(cbtMinutes),
    lightExposure,
    lightAvoidStart: minutesToTime(lightAvoidMinutes),
    dailyShiftMin: Math.round(dailyShiftMin),
    cumulativeShiftMin: Math.round(cumulativeShiftMin),
    targetWakeTime,
    mechanismNote:
      "Light after CBTmin activates ipRGCs in the retina, signaling the SCN to advance its pacemaker. Light before CBTmin does the opposite — it delays the clock.",
  };
}

// ── main export ───────────────────────────────────────────────────────────────

export function calculateSleepPlan(
  user: UserInput,
  workouts: WorkoutInput[],
  meets: MeetInput[],
  currentTSB?: number
): DailySleepPlan[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const baseWakeMinutes = timeToMinutes(user.currentWakeTime);
  const baseMinutes = baseSleepMinutes(user.age, user.biologicalSex, user.sport);

  const workoutMap = new Map<string, WorkoutInput>();
  for (const w of workouts) {
    const d = new Date(w.date);
    d.setHours(0, 0, 0, 0);
    workoutMap.set(d.toISOString(), w);
  }

  const futureMeets = meets
    .map((m) => ({ ...m, date: new Date(m.date) }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  // Precompute PRC shift schedule for every upcoming meet
  const meetShiftSchedules = futureMeets.map((m) =>
    buildMeetShiftSchedule(m, baseWakeMinutes)
  );

  const plans: DailySleepPlan[] = [];

  for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
    const date = new Date(today);
    date.setDate(today.getDate() + dayOffset);
    date.setHours(0, 0, 0, 0);

    const dateKey = date.toISOString();
    const workout = workoutMap.get(dateKey);
    const workoutType: WorkoutType = (workout?.type as WorkoutType) ?? "rest";

    const yesterday = new Date(date);
    yesterday.setDate(date.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    const yesterdayWorkout = workoutMap.get(yesterday.toISOString());
    const dayAfterHardBonus =
      yesterdayWorkout && isHardWorkout(yesterdayWorkout.type as WorkoutType) ? 15 : 0;

    let sleepNeed = baseMinutes + trainingLoadExtra(workoutType) + dayAfterHardBonus;

    const nextMeet = futureMeets.find((m) => m.date >= date) ?? null;
    const daysUntilNextMeet = nextMeet ? daysApart(date, nextMeet.date) : null;

    // Fatigue sleep boost: add 15 min for 3 nights when meet is within 10 days and TSB < -5
    const isFatigueBoostDay =
      dayOffset < 3 &&
      daysUntilNextMeet !== null && daysUntilNextMeet <= 10 &&
      typeof currentTSB === "number" && currentTSB < -5;
    const fatigueBoostMinutes = isFatigueBoostDay ? 15 : 0;
    sleepNeed += fatigueBoostMinutes;

    // ── PRC-based shift: find the controlling meet for this day ──────────────
    let bestCumulative = 0;
    let bestDailyRate = 0;
    let controllingSchedule: MeetShiftSchedule | null = null;

    for (const mss of meetShiftSchedules) {
      const daysOut = daysApart(date, mss.meet.date);

      // Include meet day itself (daysOut=0): athlete should be fully shifted
      if (daysOut < 0 || daysOut > mss.shiftWindowDays) continue;

      let cumulative: number;
      if (daysOut === 0) {
        // Race day — fully shifted
        cumulative = mss.totalAdvanceMin;
      } else {
        // Linear ramp: fully shifted at daysOut=1, starts at daysOut=shiftWindowDays
        cumulative = mss.totalAdvanceMin - (daysOut - 1) * mss.actualDailyRateMin;
        cumulative = Math.max(0, Math.round(cumulative));
      }

      if (cumulative > bestCumulative) {
        bestCumulative = cumulative;
        bestDailyRate = mss.actualDailyRateMin;
        controllingSchedule = mss;
      }
    }

    // Shifted wake and bed times for this day
    const dayWakeMinutes = baseWakeMinutes - bestCumulative;
    const bedtimeMinutes = dayWakeMinutes - sleepNeed;
    const recommendedBedtime = minutesToTime(bedtimeMinutes);
    const recommendedWakeTime = minutesToTime(dayWakeMinutes);
    const totalSleepHours = Math.round((sleepNeed / 60) * 10) / 10;

    // Wind-down phases anchored to the shifted bedtime
    const windDown: WindDownPhases = {
      phase1: minutesToTime(bedtimeMinutes - 120),
      phase2: minutesToTime(bedtimeMinutes - 90),
      phase3: minutesToTime(bedtimeMinutes - 30),
      phase4: minutesToTime(bedtimeMinutes - 15),
    };

    // ── circadian plan ───────────────────────────────────────────────────────
    let circadian: CircadianPlan | null = null;
    if (controllingSchedule && bestCumulative > 0) {
      circadian = computePRCPlan(
        dayWakeMinutes,
        bedtimeMinutes,
        bestDailyRate,
        bestCumulative,
        minutesToTime(controllingSchedule.targetWakeMinutes),
      );
    }

    // ── recovery score ───────────────────────────────────────────────────────
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

    const baselineSleep =
      ((baseWakeMinutes - timeToMinutes(user.currentBedTime) + 1440) % 1440) / 60;
    const deficit = Math.max(0, baselineSleep - totalSleepHours);
    recovery -= Math.round(deficit * 3);

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
      circadian,
      fatigueSleepBoost: isFatigueBoostDay,
      fatigueSleepBoostMinutes: fatigueBoostMinutes,
    });
  }

  return plans;
}

// ── kept for backward compatibility ──────────────────────────────────────────

export function computeRaceTimeShift(
  raceTime: string | null,
  wakeTime: string,
  priority: "A" | "B" | "C"
): number {
  if (!raceTime) return 0;
  const baseWake = timeToMinutes(wakeTime);
  const raceMin = timeToMinutes(raceTime);
  const targetWake = raceMin - 120;
  const advance = Math.max(0, Math.min(90, baseWake - targetWake));
  const scale = priority === "A" ? 1.0 : priority === "B" ? 0.75 : 0.5;
  return Math.round(advance * scale);
}

export function formatTime12h(time24: string): string {
  const [h, m] = time24.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}
