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
  phase3: string; // 45 min before (Chang et al. 2015 — screens off)
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
  advanceWindowEnd: string;   // cbtMin + 6h (advance zone boundary)
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
  preRaceShiftMinutes: number;
}

// ── Science constants ────────────────────────────────────────────────────────

// SOURCE: Czeisler & Khalsa standard / Burgess et al. (2010) — CBTmin occurs ~2 h
// before habitual wake time (not 2.5 h). It is the PRC anchor: light AFTER CBTmin
// advances the clock, light BEFORE CBTmin delays it.
const CBT_OFFSET_MINUTES = 120;

// SOURCE: Burgess et al. (2010) — the phase-advance portion of the light PRC spans
// ~6 h, beginning at CBTmin and extending into the morning.
const ADVANCE_ZONE_DURATION_MINUTES = 360;

// SOURCE: Standard race-morning logistics (warm-up + travel + pre-race routine);
// 3 h pre-gun wake aligns CBT rising phase with race start better than 11 h pre-gun.
const RACE_MORNING_WAKE_OFFSET_MINUTES = 180;

// SOURCE: Burgess et al. (2010) — max behavioral phase advance per day = 30 min
// (pharmacology-free); max cumulative ~90 min for A races over a 10-day window.
const MAX_DAILY_ADVANCE_MINUTES = { A: 30, B: 20, C: 15 } as const;
const MAX_TOTAL_ADVANCE_MINUTES = { A: 90, B: 60, C: 30 } as const;

// SOURCE: Mah et al. (2011) — sleep extension benefits accumulate over 5–7 weeks.
// Start extension 35 days before A-priority, 21 days before B-priority.
const EXTENSION_WINDOW_DAYS = { A: 35, B: 21, C: 0 } as const;
const EXTENSION_HANDOFF_DAY = 11;       // PRC ramp takes over from day 10 inward
const EXTENSION_MIN_BONUS_MIN = 20;     // start of ramp
const EXTENSION_MAX_BONUS_MIN = 45;     // peak before handoff

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

function daysApart(a: Date, b: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.round((b.getTime() - a.getTime()) / msPerDay);
}

// SOURCE: Mah et al. (2011) — collegiate athletes averaged 6.68 h actigraphy at
// baseline but reported 7.83 h (systematic underestimation of ~70 min). Performance
// gains appeared when sleep was extended to satiety, averaging 8.5 h.
function baseSleepMinutes(user: UserInput): number {
  const { age, biologicalSex, sport } = user;

  let base: number;
  if (age <= 17) {
    // AASM 8–10 h + athlete overhead → 9.25 h
    base = 9.25 * 60;
  } else if (age <= 25) {
    // Mah cohort satiety mean = 8.5 h + 15 min athlete overhead → 8.75 h
    base = 8.75 * 60;
  } else {
    // Adult baseline 8 h + 15 min athlete overhead → 8.25 h
    base = 8.25 * 60;
  }

  // SOURCE: Burgard & Ailshire (2013) — females average +0.5 h vs males.
  if (biologicalSex === "female") base += 30;

  // Sport modifier: swimming requires additional thermoregulatory recovery.
  if (sport === "swimming") base += 20;

  return base;
}

// SOURCE: Seiler (2010) three-zone model. Effort is propagated from manual
// Workout entries via workoutDataSource; Strava/assumed/template workouts have
// no effort rating, so we default to 3 (mid). Type mapping handles the zone floor.
function readEffort(workout: NormalizedWorkout | null | undefined): number {
  if (!workout) return 3;
  const e = workout.effort;
  return typeof e === "number" ? Math.max(1, Math.min(5, e)) : 3;
}

function seilerZone(workout: NormalizedWorkout | null | undefined): 1 | 2 | 3 {
  if (!workout) return 1;
  const effort = readEffort(workout);
  const type = workout.type;

  // Zone 1: rest/low-aerobic — minimal systemic stress.
  if (type === "rest" || type === "easy" || type === "cross_train") return 1;
  if (type === "moderate" && effort <= 2) return 1;

  // Zone 2: tempo/threshold — between LT1 and LT2.
  if (type === "tempo" || type === "moderate") return 2;

  // Zone 3: above LT2 — track intervals, long runs at race effort, race itself.
  if (type === "track" || type === "long_run" || type === "race") return 3;

  return 1;
}

// SOURCE: Seiler (2010) zone model × Mah (2011) extension principle.
// Effort rating is the primary scaling driver; workout type sets the zone floor.
function trainingLoadExtra(
  workout: NormalizedWorkout | null | undefined,
  aggFactor: number,
): number {
  if (!workout) return 0;

  const zone = seilerZone(workout);
  const effort = readEffort(workout);

  let zoneBaseMinutes: number;
  if (zone === 1) {
    zoneBaseMinutes = 0;
  } else if (zone === 2) {
    // Zone 2 — base 10 min + effort×3 → 13 (e1) to 25 (e5)
    zoneBaseMinutes = 10 + effort * 3;
  } else {
    // Zone 3 — base 20 min + effort×5 → 25 (e1) to 45 (e5)
    zoneBaseMinutes = 20 + effort * 5;
  }

  // SOURCE: Mah et al. (2011) — even sub-optimal extension produced measurable
  // gains; never zero out recovery. Floor scaling at 50% of zone base.
  return Math.round(zoneBaseMinutes * Math.max(0.5, aggFactor));
}

// SOURCE: Seiler (2010) zone model × Addleman/JFMK (2024) — HRV literature shows
// Zone 2 recovers faster than Zone 3. Day-after sleep bonus tracks that asymmetry.
function dayAfterZoneBonus(
  yesterdayWorkout: NormalizedWorkout | null | undefined,
  aggFactor: number,
): number {
  const zone = seilerZone(yesterdayWorkout);
  let base: number;
  if (zone === 3) base = 20;
  else if (zone === 2) base = 10;
  else base = 0;
  return Math.round(base * aggFactor);
}

// SOURCE: Mah et al. (2011) — performance gains from extension accumulate over
// 5–7 weeks. Begin 35 d (A) / 21 d (B) out; hand off to PRC ramp at day 10.
// Linear ramp from 20 min (window start) to 45 min (day 11).
function sleepExtensionBonus(
  daysUntilMeet: number | null,
  meetPriority: "A" | "B" | "C" | null,
  aggFactor: number,
): number {
  if (daysUntilMeet === null || !meetPriority) return 0;
  const windowStart = EXTENSION_WINDOW_DAYS[meetPriority];
  if (windowStart === 0) return 0;
  if (daysUntilMeet > windowStart) return 0;
  if (daysUntilMeet <= 10) return 0; // PRC phase advance takes over

  const range = windowStart - EXTENSION_HANDOFF_DAY;
  if (range <= 0) return 0;
  const progress = (windowStart - daysUntilMeet) / range; // 0 → 1
  const span = EXTENSION_MAX_BONUS_MIN - EXTENSION_MIN_BONUS_MIN;
  const bonus = EXTENSION_MIN_BONUS_MIN + Math.round(progress * span);
  return Math.round(bonus * aggFactor);
}

// SOURCE: Burgess et al. (2010) PRC shape — phase advance accelerates as race
// approaches. Each day-to-day delta stays under 30 min/day for a 90-min A-race
// total advance (verified: day 2→1 = 0.18 × 90 = 16.2 min).
function phaseAdvanceFraction(daysOut: number): number {
  if (daysOut > 10) return 0;
  if (daysOut <= 0) return 1.0;
  const fractions: Record<number, number> = {
    10: 0.03,
    9:  0.07,
    8:  0.12,
    7:  0.19,
    6:  0.28,
    5:  0.38,
    4:  0.52,
    3:  0.67,
    2:  0.82,
    1:  1.00,
  };
  return fractions[Math.round(daysOut)] ?? 0;
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
    // SOURCE: 3 h pre-gun wake = standard race-morning routine for track athletes.
    const raceMin = timeToMinutes(meet.raceTime);
    targetWakeMinutes = raceMin - RACE_MORNING_WAKE_OFFSET_MINUTES;
  } else {
    const defaultAdv = meet.priority === "A" ? 30 : meet.priority === "B" ? 15 : 0;
    targetWakeMinutes = baseWakeMinutes - defaultAdv;
  }

  // SOURCE: Burgess et al. (2010) — total-advance ceiling by priority.
  const totalCap = MAX_TOTAL_ADVANCE_MINUTES[meet.priority];
  const rawAdvanceMin = Math.max(0, Math.min(totalCap, baseWakeMinutes - targetWakeMinutes));
  const totalAdvanceMin = Math.round(rawAdvanceMin * aggFactor);

  const maxDailyRate = MAX_DAILY_ADVANCE_MINUTES[meet.priority];

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
  // SOURCE: Czeisler / Burgess — CBTmin ~2 h before habitual wake.
  const cbtMinutes = ((dayWakeMinutes - CBT_OFFSET_MINUTES) % 1440 + 1440) % 1440;
  // SOURCE: Burgess et al. (2010) — advance zone spans ~6 h after CBTmin.
  const advanceEndMinutes = cbtMinutes + ADVANCE_ZONE_DURATION_MINUTES;
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

  // SOURCE: Chang et al. (2015) — blue-light avoidance window starts ~3 h pre-bed.
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
  const baseMinutes = baseSleepMinutes(user);

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
  // SOURCE: Mah et al. (2011) — sleep deficit performance loss is steep; per-hour
  // penalty bumped from 3 → 4 pts.
  const recentSleepLogs = opts?.recentSleepLogs ?? [];
  let globalSleepPenalty = 0;
  for (const log of recentSleepLogs) {
    if (log.hitTarget === false && log.actualBedtime && log.recommendedBedtime) {
      let devMin = timeToMinutes(log.actualBedtime) - timeToMinutes(log.recommendedBedtime);
      if (devMin < -720) devMin += 1440;
      if (devMin > 720) devMin -= 1440;
      if (devMin > 0) {
        globalSleepPenalty += (devMin / 60) * 4;
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
    const dayAfterBonus = dayAfterZoneBonus(yesterdayWorkout, aggFactor);

    let sleepNeed = baseMinutes + trainingLoadExtra(nw, aggFactor) + dayAfterBonus;

    const nextMeet = futureMeets.find((m) => m.date >= date) ?? null;
    const daysUntilNextMeet = nextMeet ? daysApart(date, nextMeet.date) : null;

    // SOURCE: Mah et al. (2011) — apply extension bonus 11–35 d out (A) / 11–21 d (B).
    const extensionBonus = sleepExtensionBonus(
      daysUntilNextMeet,
      nextMeet?.priority ?? null,
      aggFactor,
    );
    sleepNeed += extensionBonus;

    const isFatigueBoostDay =
      dayOffset < 3 &&
      daysUntilNextMeet !== null && daysUntilNextMeet <= 10 &&
      typeof currentTSB === "number" && currentTSB < -5;
    const fatigueBoostMinutes = isFatigueBoostDay ? 15 : 0;
    sleepNeed += fatigueBoostMinutes;

    let bestPreRaceShift = 0;
    let bestCircadianShift = 0;
    let bestDailyRate = 0;
    let controllingSchedule: MeetShiftSchedule | null = null;
    let recoveryShift = 0;

    for (const mss of meetShiftSchedules) {
      const daysOut = daysApart(date, mss.meet.date);
      if (daysOut < -3 || daysOut > 10) continue;

      if (daysOut < 0) {
        // Post-meet recovery: fade bedtime shift back over 3 nights, wake returns immediately
        const nightIdx = -daysOut - 1;
        const multipliers = [0.67, 0.33, 0.0];
        const multiplier = multipliers[nightIdx] ?? 0;
        const candidate = Math.round(multiplier * (mss.totalAdvanceMin + cappedDelay));
        if (candidate > recoveryShift) recoveryShift = candidate;
        continue;
      }

      const raceFraction = phaseAdvanceFraction(daysOut);
      const preRaceCumulative = Math.round(raceFraction * mss.totalAdvanceMin);
      const circadianCumulative = Math.round(raceFraction * cappedDelay);

      const prevFraction = phaseAdvanceFraction(daysOut + 1);
      const dailyShift = (raceFraction - prevFraction) * (mss.totalAdvanceMin + cappedDelay);

      if (preRaceCumulative > bestPreRaceShift) {
        bestPreRaceShift = preRaceCumulative;
        bestCircadianShift = circadianCumulative;
        bestDailyRate = dailyShift;
        controllingSchedule = mss;
      }
    }

    const totalBedtimeShift = bestPreRaceShift + bestCircadianShift;
    // Wake only advances for race alignment — circadian correction stays in bedtime only
    const dayWakeMinutes = baseWakeMinutes - bestPreRaceShift;
    const rawBedtimeMinutes = dayWakeMinutes - sleepNeed - bestCircadianShift - recoveryShift;
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

    // SOURCE: Chang et al. (2015) — eReader use suppresses melatonin 55% and delays
    // DLMO 1.5 h; suppression persists ~45 min post-exposure. Phase 3 corrected to T-45.
    const windDown: WindDownPhases = {
      phase1: minutesToTime(bedtimeMinutes - 120),
      phase2: minutesToTime(bedtimeMinutes - 90),
      phase3: minutesToTime(bedtimeMinutes - 45),
      phase4: minutesToTime(bedtimeMinutes - 15),
    };

    let circadian: CircadianPlan | null = null;
    if (controllingSchedule && totalBedtimeShift > 0) {
      circadian = computePRCPlan(
        dayWakeMinutes,
        bedtimeMinutes,
        bestDailyRate,
        totalBedtimeShift,
        minutesToTime(controllingSchedule.targetWakeMinutes),
      );
    }

    // ── Recovery score (HRV-proxy model per Addleman/JFMK 2024) ──
    // Start at 100; deductions reflect autonomic load + sleep deficit + competition pressure.
    let recovery = 100;

    // SOURCE: Addleman/JFMK (2024) + Seiler (2010) — Zone 3 days suppress RMSSD
    // more than Zone 2 days; rest days break the streak.
    let zone3Streak = 0;
    let zone2Streak = 0;
    for (let j = 0; j < dayOffset; j++) {
      const d = new Date(today);
      d.setDate(today.getDate() + j);
      d.setHours(0, 0, 0, 0);
      const w = workoutMap.get(d.toISOString());
      const zone = seilerZone(w);
      if (zone === 1) {
        zone3Streak = 0;
        zone2Streak = 0;
      } else if (zone === 3) {
        zone3Streak++;
      } else {
        zone2Streak++;
      }
    }
    recovery -= zone3Streak * 7;
    recovery -= zone2Streak * 3;

    // SOURCE: Mah (2011) — competition + sleep deficit compounds the deficit cost.
    const hasMeetDeadline = daysUntilNextMeet !== null && daysUntilNextMeet <= 3;
    if (hasMeetDeadline && globalSleepPenalty > 0) {
      recovery -= 12;
    } else if (hasMeetDeadline) {
      recovery -= 10;
    }

    recovery -= globalSleepPenalty;
    recovery += globalStreakBonus;

    // SOURCE: Addleman/JFMK (2024) — rest restores HRV faster than light training.
    for (let j = Math.max(0, dayOffset - 3); j < dayOffset; j++) {
      const d = new Date(today);
      d.setDate(today.getDate() + j);
      d.setHours(0, 0, 0, 0);
      const w = workoutMap.get(d.toISOString());
      if (!w || w.type === "rest") recovery += 6;
    }

    // SOURCE: Mah (2011) — being inside the extension window indicates the athlete
    // is accumulating performance reserve; small positive recovery signal.
    if (extensionBonus > 0) recovery += 3;

    recovery = Math.max(0, Math.min(100, recovery));

    // Build recovery factor breakdown for display
    const recoveryFactors: string[] = [];
    if (globalSleepPenalty > 0) recoveryFactors.push(`Sleep deficit: -${globalSleepPenalty} pts`);
    if (globalStreakBonus > 0) recoveryFactors.push(`Sleep streak: +${globalStreakBonus} pts`);
    if (zone3Streak > 0) recoveryFactors.push(`Zone 3 load: -${zone3Streak * 7} pts`);
    if (zone2Streak > 0) recoveryFactors.push(`Zone 2 load: -${zone2Streak * 3} pts`);
    if (hasMeetDeadline) {
      recoveryFactors.push(
        globalSleepPenalty > 0 ? "Meet + deficit: -12 pts" : "Meet approaching: -10 pts",
      );
    }
    if (extensionBonus > 0) recoveryFactors.push("Extension phase: +3 pts");

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

    // Map zone (1/2/3) to the existing "low" | "medium" | "high" UI label.
    const zoneForDay = seilerZone(nw);
    const trainingLevel: "low" | "medium" | "high" =
      zoneForDay === 1 ? "low" : zoneForDay === 2 ? "medium" : "high";

    plans.push({
      date,
      recommendedBedtime,
      recommendedWakeTime,
      totalSleepHours,
      trainingLoadLevel: trainingLevel,
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
      preRaceShiftMinutes: totalBedtimeShift,
    });
  }

  console.log("[algorithm] plan summary:", plans.slice(0, 10).map((d, i) => ({
    dayOffset: startDayOffset + i,
    wake: d.recommendedWakeTime,
    bed: d.recommendedBedtime,
    shift: d.preRaceShiftMinutes,
  })));

  return plans;
}

// ── kept for backward compatibility ──────────────────────────────────────────

/**
 * @deprecated Use buildMeetShiftSchedule instead.
 * This function uses the pre-science-rewrite constants (90-min cap, raceMin-120 anchor)
 * and is kept only for backward compatibility with external callers.
 * Burgess et al. (2010) establishes 90 min as the correct total-advance ceiling for A races
 * and raceMin-180 as the correct wake-time anchor for track athletes.
 */
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
