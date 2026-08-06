// Writing what a text message tells us into the night it belongs to.

import type { SleepSource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  guardRecalledDuration,
  isSplitNight,
  resolveNight,
  INFERRED_GRACE_MINUTES,
  type NightResolution,
} from "@/lib/sleepGuards";
import { addLocalDays, instantFromLocal, localDateOf, type LocalDate } from "@/lib/messaging/time";

/**
 * Which night a message belongs to.
 *
 * A night is filed under the local date it *begins*, matching the rest of the
 * app: the dashboard's morning confirmation posts under yesterday's date, and a
 * plan day's bedtime and wake time sit on consecutive calendar days.
 *
 * Noon is the cut. Everything from midday onward opens the coming night; a
 * message before midday closes the one that just ended. That single rule
 * handles all four cases correctly — "bed" at 21:30, "bed" at 00:40 after a
 * late night, "up" at 05:15, and a wake time declared at 20:00 for tomorrow.
 */
export function nightDateFor(instant: Date, timeZone: string): LocalDate {
  const local = localDateOf(instant, timeZone);
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { timeZone, hour: "2-digit", hourCycle: "h23" })
      .formatToParts(instant)
      .find((p) => p.type === "hour")?.value ?? "0",
  );
  return hour < 12 ? addLocalDays(local, -1) : local;
}

/**
 * How much a duration derived from this row can be trusted, 0–1.
 *
 * Ordinal rather than calibrated — these are ranks, not probabilities, and
 * nothing should treat them as measured. What matters is the ordering: a
 * timestamp we recorded ourselves beats a time recalled hours later, which
 * beats a value we filled in because nobody replied.
 */
export const SOURCE_CONFIDENCE: Record<SleepSource, number> = {
  TIMESTAMPED: 0.9,
  RECALLED: 0.6,
  MANUAL: 0.5,
  INFERRED: 0.3,
};

/** SleepLog.date is stored at UTC midnight of the local date key. */
function dayStart(localDate: LocalDate): Date {
  return new Date(`${localDate}T00:00:00.000Z`);
}

interface NightWrite {
  userId: string;
  nightDate: LocalDate;
  /** Used only when the row has to be created; the column is non-null. */
  fallbackBedtime: string;
  data: {
    sleepOnsetAt?: Date;
    wakeAt?: Date;
    declaredWakeAt?: Date;
    /** Null clears a duration that a guard has just rejected. */
    actualSleepHours?: number | null;
    source?: SleepSource;
    confidence?: number;
    needsReview?: boolean;
    needsReviewNote?: string | null;
  };
}

/**
 * Upserts one night's row. Create and update carry the same payload so a text
 * that arrives before any row exists behaves identically to one that arrives
 * after — the SMS flow and the web flow write to the same row, by design.
 */
export async function writeNight(write: NightWrite) {
  return prisma.sleepLog.upsert({
    where: { userId_date: { userId: write.userId, date: dayStart(write.nightDate) } },
    create: {
      userId: write.userId,
      date: dayStart(write.nightDate),
      recommendedBedtime: write.fallbackBedtime,
      ...write.data,
    },
    update: write.data,
  });
}

/** The row as it stands, or null when this night has no record yet. */
function existingNight(userId: string, nightDate: LocalDate) {
  return prisma.sleepLog.findUnique({
    where: { userId_date: { userId, date: dayStart(nightDate) } },
  });
}

/**
 * A BED reply. The onset is our receipt timestamp, not a time the athlete
 * reported — that is the entire reason this interaction exists, and the reason
 * TIMESTAMPED outranks everything else.
 *
 * A second BED with no UP between is a split night: they got up in the middle.
 * The first onset is kept, because it is still true that the night began then,
 * and the row is flagged rather than scored — no arithmetic over two onsets and
 * one wake yields the real total. Both messages survive verbatim in
 * InboundMessage for anyone reconstructing what happened.
 */
export async function recordBed(input: {
  userId: string;
  nightDate: LocalDate;
  receivedAt: Date;
  fallbackBedtime: string;
}) {
  const existing = await existingNight(input.userId, input.nightDate);

  if (existing && isSplitNight(existing)) {
    return writeNight({
      userId: input.userId,
      nightDate: input.nightDate,
      fallbackBedtime: input.fallbackBedtime,
      data: {
        // sleepOnsetAt deliberately untouched.
        needsReview: true,
        needsReviewNote: `split night: second BED at ${input.receivedAt.toISOString()} with no UP after the first at ${existing.sleepOnsetAt!.toISOString()}`,
        actualSleepHours: null,
      },
    });
  }

  return writeNight({
    userId: input.userId,
    nightDate: input.nightDate,
    fallbackBedtime: input.fallbackBedtime,
    data: {
      sleepOnsetAt: input.receivedAt,
      source: "TIMESTAMPED",
      confidence: SOURCE_CONFIDENCE.TIMESTAMPED,
    },
  });
}

/**
 * An UP reply. Records the wake, then scores the night — or refuses to, and
 * says why. The refusal is the point: a duration is written only when the two
 * timestamps describe something that could have been a night.
 */
export async function recordUp(input: {
  userId: string;
  nightDate: LocalDate;
  receivedAt: Date;
  fallbackBedtime: string;
}) {
  const existing = await existingNight(input.userId, input.nightDate);
  const resolution = resolveNight(
    {
      sleepOnsetAt: existing?.sleepOnsetAt ?? null,
      wakeAt: input.receivedAt,
      declaredWakeAt: existing?.declaredWakeAt ?? null,
    },
    input.receivedAt,
  );

  return writeNight({
    userId: input.userId,
    nightDate: input.nightDate,
    fallbackBedtime: input.fallbackBedtime,
    data: { wakeAt: input.receivedAt, ...applyResolution(resolution) },
  });
}

/**
 * Turns a resolution into the columns it implies.
 *
 * The invariant every consumer depends on: a flagged row never carries a
 * duration. `actualSleepHours` is what the trend chart averages and what the
 * sleep-debt calculation subtracts from, so leaving a rejected number in place
 * would defeat the whole exercise.
 */
function applyResolution(resolution: NightResolution): NightWrite["data"] {
  if (resolution.kind === "duration") {
    return {
      actualSleepHours: Math.round((resolution.minutes / 60) * 100) / 100,
      source: resolution.source,
      confidence: SOURCE_CONFIDENCE[resolution.source],
      needsReview: false,
      needsReviewNote: null,
    };
  }
  if (resolution.kind === "review") {
    return {
      actualSleepHours: null,
      needsReview: true,
      needsReviewNote: `${resolution.reason}: ${resolution.note}`,
    };
  }
  return {};
}

/**
 * A declared wake time, stored as the instant it names.
 *
 * The wake always falls on the morning after the night begins, so the clock is
 * resolved against `nightDate + 1`. Resolving it against the night's own date
 * would put a 05:30 wake fourteen hours before the bedtime it is supposed to
 * anchor.
 */
export function recordDeclaredWake(input: {
  userId: string;
  nightDate: LocalDate;
  clock: string;
  timeZone: string;
  fallbackBedtime: string;
}) {
  const { instant } = instantFromLocal(addLocalDays(input.nightDate, 1), input.clock, input.timeZone);
  return writeNight({
    userId: input.userId,
    nightDate: input.nightDate,
    fallbackBedtime: input.fallbackBedtime,
    data: { declaredWakeAt: instant },
  }).then((row) => ({ row, wakeInstant: instant }));
}

/**
 * A duration the athlete reported after the fact. Recorded as RECALLED, which
 * is deliberately below TIMESTAMPED: self-reported sleep runs long by about an
 * hour against actigraphy, and the source column is how that stays visible
 * rather than being averaged into the timestamped nights as though equal.
 */
export function recordRecalledDuration(input: {
  userId: string;
  nightDate: LocalDate;
  minutes: number;
  fallbackBedtime: string;
}) {
  const guarded = guardRecalledDuration(input.minutes);

  // Same window as a timestamped night. "About 18 hours" parses cleanly and is
  // still not a night, and a self-reported number gets no exemption from the
  // check just because a person typed it.
  const data =
    guarded.kind === "duration"
      ? {
          actualSleepHours: Math.round((guarded.minutes / 60) * 100) / 100,
          source: "RECALLED" as const,
          confidence: SOURCE_CONFIDENCE.RECALLED,
          needsReview: false,
          needsReviewNote: null,
        }
      : {
          actualSleepHours: null,
          needsReview: true,
          needsReviewNote:
            guarded.kind === "review" ? `${guarded.reason}: ${guarded.note}` : null,
        };

  return writeNight({
    userId: input.userId,
    nightDate: input.nightDate,
    fallbackBedtime: input.fallbackBedtime,
    data,
  });
}

/**
 * Closes nights nobody closed.
 *
 * Run from the daily cron. Finds rows with an onset, no wake, and a declared
 * wake that passed more than the grace period ago, and settles each one — as a
 * duration when the arithmetic is plausible, as a flagged row when it is not.
 *
 * The once-a-day cadence means a night can sit open for the best part of a day
 * before being closed. That is a consequence of the platform's daily cron, and
 * it is harmless: an open row contributes nothing to any average, so the only
 * cost is that the record appears late rather than wrong.
 */
export async function closeUnresolvedNights(now: Date): Promise<{
  closed: number;
  flagged: number;
}> {
  const deadline = new Date(now.getTime() - INFERRED_GRACE_MINUTES * 60000);

  const open = await prisma.sleepLog.findMany({
    where: {
      sleepOnsetAt: { not: null },
      wakeAt: null,
      declaredWakeAt: { not: null, lt: deadline },
      actualSleepHours: null,
      needsReview: false,
    },
    select: {
      id: true,
      sleepOnsetAt: true,
      wakeAt: true,
      declaredWakeAt: true,
    },
  });

  let closed = 0;
  let flagged = 0;

  for (const row of open) {
    const resolution = resolveNight(row, now);
    if (resolution.kind === "wait") continue;

    await prisma.sleepLog.update({
      where: { id: row.id },
      data: applyResolution(resolution),
    });
    if (resolution.kind === "duration") closed++;
    else flagged++;
  }

  return { closed, flagged };
}
