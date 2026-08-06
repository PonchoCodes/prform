// Shared plan lookup for the messaging layer.
//
// Both the cron and the inbound handler need "what is this athlete's target for
// that night", and both need it keyed by a local date rather than an array
// index. Kept in one place so the two cannot drift.

import { prisma } from "@/lib/prisma";
import { calculateSleepPlan, type DailySleepPlan } from "@/lib/sleepAlgorithm";
import { getWorkoutsForDateRange } from "@/lib/workoutDataSource";
import type { LocalDate } from "@/lib/messaging/time";

export interface PlanUser {
  id: string;
  age: number | null;
  biologicalSex: string | null;
  currentWakeTime: string | null;
  currentBedTime: string | null;
  planAggressiveness: number;
  bedtimeAdjustmentMinutes: number;
}

export const PLAN_USER_SELECT = {
  id: true,
  age: true,
  biologicalSex: true,
  currentWakeTime: true,
  currentBedTime: true,
  planAggressiveness: true,
  bedtimeAdjustmentMinutes: true,
} as const;

/**
 * The athlete's plan, indexed by the plan's own date key.
 *
 * A key is the date the night *begins* — the evening the athlete goes to bed —
 * which is the convention the rest of the app already uses: the dashboard files
 * a morning confirmation under yesterday's date, and `recommendedBedtime` and
 * `recommendedWakeTime` on one plan day describe consecutive evenings and
 * mornings. Getting this backwards would file every text-sourced night one day
 * off from every web-sourced one.
 *
 * `declaredWake` applies a declared wake time to one night, which is what makes
 * the returned bedtime the one to text back.
 */
export async function planIndexFor(
  user: PlanUser,
  declaredWake?: { localDate: LocalDate; clock: string },
): Promise<Map<string, DailySleepPlan>> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(today);
  start.setDate(today.getDate() - 1);
  const end = new Date(today);
  end.setDate(today.getDate() + 3);

  const [{ workouts }, meets] = await Promise.all([
    getWorkoutsForDateRange(user.id, start, end),
    prisma.meet.findMany({ where: { userId: user.id }, orderBy: { date: "asc" } }),
  ]);

  const plans = calculateSleepPlan(
    {
      age: user.age ?? 25,
      biologicalSex: user.biologicalSex ?? "male",
      currentWakeTime: user.currentWakeTime ?? "06:00",
      currentBedTime: user.currentBedTime ?? "22:00",
      planAggressiveness: user.planAggressiveness,
      bedtimeAdjustmentMinutes: user.bedtimeAdjustmentMinutes,
    },
    meets.map((m) => ({
      date: m.date,
      priority: m.priority as "A" | "B" | "C",
      name: m.name,
      raceTime: m.raceTime ?? null,
    })),
    workouts,
    undefined,
    {
      startDayOffset: -1,
      declaredWakeByDate: declaredWake
        ? { [declaredWake.localDate]: declaredWake.clock }
        : undefined,
    },
  );

  const index = new Map<string, DailySleepPlan>();
  for (const plan of plans) {
    index.set(plan.date.toISOString().slice(0, 10), plan);
  }
  return index;
}
