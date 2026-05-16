// Re-export shared pure types so callers have one import point.
// workoutTypes.ts has NO server imports — safe for client component import chains.
export type { WorkoutType, NormalizedWorkout } from "@/lib/workoutTypes";
import type { WorkoutType, NormalizedWorkout } from "@/lib/workoutTypes";

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
  planAggressiveness?: number;       // 50–100, default 85
  bedtimeAdjustmentMinutes?: number; // -45 to +45, default 0
}

export interface SleepLogForPlan {
  date: string;            // YYYY-MM-DD
  hitTarget?: boolean | null;
  actualBedtime?: string | null;
  actualSleepHours?: number | null;
  recommendedBedtime?: string | null;
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
  workoutSource: "strava" | "manual" | "assumed" | "rest";
  isTentative: boolean;
  // Sleep confirmation enrichment (null for future days or when unlogged)
  actualBedtime: string | null;
  actualSleepHours: number | null;
  sleepConfirmed: boolean;
  recoverySleepNote: string;
  recoveryFactors: string[];
  allRecentMissed: boolean;
  circadianDelayMinutes: number;
  circadianDetectedBedtime: string | null;
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

function trainingLoadExtra(type: WorkoutType, aggFactor: number): number {
  let base = 0;
  if (type === "moderate") base = 15;
  else if (type === "tempo" || type === "track") base = 20;
  else if (type === "long_run") base = 30;
  return Math.round(base * aggFactor);
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
  aggFactor: number = 1,
): MeetShiftSchedule {
  let targetWakeMinutes: number;

  if (meet.raceTime) {
    const raceMin = timeToMinutes(meet.raceTime);
    targetWakeMinutes = raceMin - 120;
  } else {
    const defaultAdv = meet.priority === "A" ? 30 : meet.priority === "B" ? 15 : 0;
    targetWakeMinutes = baseWakeMinutes - defaultAdv;
  }

  const rawAdvanceMin = Math.max(0, Math.min(90, baseWakeMinutes - targetWakeMinutes));
  const totalAdvanceMin = Math.round(rawAdvanceMin * aggFactor);

  const maxDailyRate = meet.priority === "A" ? 30 : meet.priority === "B" ? 20 : 15;

  const shiftWindowDays =
    totalAdvanceMin > 0 ? Math.min(10, Math.ceil(totalAdvanceMin / maxDailyRate)) : 0;

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
  const cbtMinutes = ((dayWakeMinutes - 150) % 1440 + 1440) % 1440;
  const advanceEndMinutes = cbtMinutes + 240;
  const lightStartMinutes = cbtMinutes;
  const lightEndMinutes = cbtMinutes + 45;
  const cbtHour = cbtMinutes / 60;
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

// ── Circadian phase detection ─────────────────────────────────────────────────

const SHIFT_FRACTIONS: Record<number, number> = {
  10: 0.10 / 3,
  9: (0.10 * 2) / 3,
  8: 0.10,
  7: 0.10 + 0.25 / 3,
  6: 0.10 + (0.25 * 2) / 3,
  5: 0.35,
  4: 0.35 + 0.40 / 3,
  3: 0.35 + (0.40 * 2) / 3,
  2: 0.75,
  1: 1.0,
  0: 1.0,
};

function detectActualCircadianPhase(
  recentSleepLogs: SleepLogForPlan[],
  baselineBedtime: string,
): number {
  const missedWithBedtime = recentSleepLogs.filter(
    (l) => l.hitTarget === false && l.actualBedtime
  );
  if (missedWithBedtime.length < 3) return timeToMinutes(baselineBedtime);
  const minutesList = missedWithBedtime.map((l) => {
    const m = timeToMinutes(l.actualBedtime!);
    return m < 360 ? m + 1440 : m;
  });
  return Math.round(minutesList.reduce((a, b) => a + b, 0) / minutesList.length);
}

// ── main export ───────────────────────────────────────────────────────────────

export function calculateSleepPlan(
  user: UserInput,
  meets: MeetInput[],
  workoutDataSource: NormalizedWorkout[],
  currentTSB?: number,
  opts?: { startDayOffset?: number; sleepLogs?: SleepLogForPlan[]; recentSleepLogs?: SleepLogForPlan[] }
): DailySleepPlan[] {
  const startDayOffset = opts?.startDayOffset ?? 0;
  const sleepLogs = opts?.sleepLogs ?? [];
  const aggFactor = Math.min(100, Math.max(50, user.planAggressiveness ?? 85)) / 100;
  const bedtimeAdj = Math.min(45, Math.max(-45, user.bedtimeAdjustmentMinutes ?? 0));

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const baseWakeMinutes = timeToMinutes(user.currentWakeTime);
  const baseMinutes = baseSleepMinutes(user.age, user.biologicalSex, user.sport);

  const workoutMap = new Map<string, NormalizedWorkout>();
  for (const w of workoutDataSource) {
    const d = new Date(w.date);
    d.setHours(0, 0, 0, 0);
    workoutMap.set(d.toISOString(), w);
  }

  // Build SleepLog lookup map: YYYY-MM-DD → log
  const sleepLogMap = new Map<string, SleepLogForPlan>();
  for (const log of sleepLogs) {
    sleepLogMap.set(log.date, log);
  }

  // Compute sleep penalty and streak from the most recent 3 logged nights.
  // recentSleepLogs must be ordered DESC (most recent first).
  const recentSleepLogs = opts?.recentSleepLogs ?? [];
  let globalSleepPenalty = 0;
  for (const log of recentSleepLogs) {
    if (log.hitTarget === false && log.actualBedtime && log.recommendedBedtime) {
      let devMin = timeToMinutes(log.actualBedtime) - timeToMinutes(log.recommendedBedtime);
      if (devMin < -720) devMin += 1440;
      if (devMin > 720) devMin -= 1440;
      if (devMin > 0) {
        globalSleepPenalty += (devMin / 60) * 3;
      }
    }
  }
  globalSleepPenalty = Math.round(globalSleepPenalty);

  // Streak: consecutive hitTarget=true from most recent going backward
  let sleepStreak = 0;
  for (const log of recentSleepLogs) {
    if (log.hitTarget === true) sleepStreak++;
    else break;
  }
  const globalStreakBonus = Math.min(sleepStreak * 2, 10);

  const allRecentMissed =
    recentSleepLogs.length > 0 && recentSleepLogs.every((l) => l.hitTarget === false);

  const actualPhaseMinutes = detectActualCircadianPhase(
    recentSleepLogs,
    user.currentBedTime ?? "22:30",
  );
  const baselineBedtimeMinutes = timeToMinutes(user.currentBedTime ?? "22:30");
  const circadianDelay = Math.max(0, actualPhaseMinutes - baselineBedtimeMinutes);
  const cappedDelay = Math.min(circadianDelay, 240);
  const circadianDetectedBedtime = cappedDelay > 0
    ? minutesToTime(actualPhaseMinutes % 1440)
    : null;

  const futureMeets = meets
    .map((m) => ({ ...m, date: new Date(m.date) }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  const meetShiftSchedules = futureMeets.map((m) =>
    buildMeetShiftSchedule(m, baseWakeMinutes, aggFactor)
  );

  const plans: DailySleepPlan[] = [];
  // Loop from startDayOffset to 13 (inclusive)
  const dayCount = 14 - startDayOffset;

  for (let i = 0; i < dayCount; i++) {
    const dayOffset = startDayOffset + i;
    const date = new Date(today);
    date.setDate(today.getDate() + dayOffset);
    date.setHours(0, 0, 0, 0);

    const dateKey = date.toISOString();
    const dateStr = date.toISOString().slice(0, 10);
    const nw = workoutMap.get(dateKey);
    const workoutType: WorkoutType = nw?.type ?? "rest";
    const workoutSource = nw?.source ?? "rest";
    const workoutTentative = nw?.isTentative ?? false;

    const yesterday = new Date(date);
    yesterday.setDate(date.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    const yesterdayWorkout = workoutMap.get(yesterday.toISOString());
    const dayAfterHardBonusBase = yesterdayWorkout && isHardWorkout(yesterdayWorkout.type) ? 15 : 0;
    const dayAfterHardBonus = Math.round(dayAfterHardBonusBase * aggFactor);

    let sleepNeed = baseMinutes + trainingLoadExtra(workoutType, aggFactor) + dayAfterHardBonus;

    const nextMeet = futureMeets.find((m) => m.date >= date) ?? null;
    const daysUntilNextMeet = nextMeet ? daysApart(date, nextMeet.date) : null;

    const isFatigueBoostDay =
      dayOffset < 3 &&
      daysUntilNextMeet !== null && daysUntilNextMeet <= 10 &&
      typeof currentTSB === "number" && currentTSB < -5;
    const fatigueBoostMinutes = isFatigueBoostDay ? 15 : 0;
    sleepNeed += fatigueBoostMinutes;

    let bestCumulative = 0;
    let bestDailyRate = 0;
    let controllingSchedule: MeetShiftSchedule | null = null;

    for (const mss of meetShiftSchedules) {
      const daysOut = daysApart(date, mss.meet.date);
      if (daysOut < 0 || daysOut > 10) continue;

      const totalShiftNeeded = mss.totalAdvanceMin + cappedDelay;
      const fraction = SHIFT_FRACTIONS[daysOut] ?? 0;
      const cumulative = Math.round(fraction * totalShiftNeeded);

      const prevFraction = daysOut < 10 ? (SHIFT_FRACTIONS[daysOut + 1] ?? 0) : 0;
      const dailyShift = (fraction - prevFraction) * totalShiftNeeded;

      if (cumulative > bestCumulative) {
        bestCumulative = cumulative;
        bestDailyRate = dailyShift;
        controllingSchedule = mss;
      }
    }

    const dayWakeMinutes = baseWakeMinutes - bestCumulative;
    const rawBedtimeMinutes = dayWakeMinutes - sleepNeed;
    let bedtimeMinutes = Math.round(rawBedtimeMinutes + bedtimeAdj);
    if (plans.length > 0) {
      const prevBedMin = timeToMinutes(plans[plans.length - 1].recommendedBedtime);
      if (prevBedMin - bedtimeMinutes > 45) {
        bedtimeMinutes = prevBedMin - 45;
      }
    }
    const recommendedBedtime = minutesToTime(bedtimeMinutes);
    const recommendedWakeTime = minutesToTime(dayWakeMinutes);
    const totalSleepHours = Math.round((sleepNeed / 60) * 10) / 10;

    const windDown: WindDownPhases = {
      phase1: minutesToTime(bedtimeMinutes - 120),
      phase2: minutesToTime(bedtimeMinutes - 90),
      phase3: minutesToTime(bedtimeMinutes - 30),
      phase4: minutesToTime(bedtimeMinutes - 15),
    };

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

    let recovery = 100;
    let consecutiveHard = 0;
    for (let j = 0; j < dayOffset; j++) {
      const d = new Date(today);
      d.setDate(today.getDate() + j);
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

    recovery -= globalSleepPenalty;
    recovery += globalStreakBonus;

    for (let j = Math.max(0, dayOffset - 3); j < dayOffset; j++) {
      const d = new Date(today);
      d.setDate(today.getDate() + j);
      d.setHours(0, 0, 0, 0);
      const w = workoutMap.get(d.toISOString());
      if (!w || w.type === "rest") recovery += 5;
    }

    recovery = Math.max(0, Math.min(100, recovery));

    // Build recovery factor breakdown for display
    const recoveryFactors: string[] = [];
    if (globalSleepPenalty > 0) recoveryFactors.push(`Sleep deficit: -${globalSleepPenalty} pts`);
    if (globalStreakBonus > 0) recoveryFactors.push(`Sleep streak: +${globalStreakBonus} pts`);
    if (consecutiveHard > 0) recoveryFactors.push(`Training load: -${consecutiveHard * 5} pts`);
    if (daysUntilNextMeet !== null && daysUntilNextMeet <= 3) recoveryFactors.push("Meet approaching: -10 pts");

    const recoverySleepNote = recentSleepLogs.length > 0
      ? recoveryFactors.join(" · ")
      : "Log your sleep each morning to improve the accuracy of your recovery score.";

    // Enrich with SleepLog data for past days
    const sleepLog = sleepLogMap.get(dateStr);
    let actualBedtime: string | null = null;
    let actualSleepHoursOut: number | null = null;
    let sleepConfirmed = false;

    if (sleepLog && dayOffset <= 0) {
      sleepConfirmed = true;
      if (sleepLog.hitTarget === true) {
        actualBedtime = recommendedBedtime;
      } else if (sleepLog.actualBedtime) {
        actualBedtime = sleepLog.actualBedtime;
      }
      actualSleepHoursOut = sleepLog.actualSleepHours ?? null;
    }

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
      workoutSource: workoutSource as "strava" | "manual" | "assumed" | "rest",
      isTentative: workoutTentative,
      actualBedtime,
      actualSleepHours: actualSleepHoursOut,
      sleepConfirmed,
      recoverySleepNote,
      recoveryFactors,
      allRecentMissed,
      circadianDelayMinutes: cappedDelay,
      circadianDetectedBedtime,
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

export function aggressivenessForExperienceLevel(level: string): number {
  switch (level) {
    case "high_school": return 70;
    case "collegiate": return 85;
    case "post_collegiate": return 100;
    case "masters": return 75;
    default: return 85;
  }
}
