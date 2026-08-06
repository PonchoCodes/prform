import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calculateSleepPlan } from "@/lib/sleepAlgorithm";
import { getWorkoutsForDateRange } from "@/lib/workoutDataSource";
import { sendMessage } from "@/lib/messaging/send";
import { closeUnresolvedNights } from "@/lib/messaging/night";
import { eveningWakeQuestion } from "@/lib/messaging/copy";
import {
  addLocalDays,
  clockToMinutes,
  instantFromLocal,
  isValidTimeZone,
  localDateOf,
  minutesToClock,
} from "@/lib/messaging/time";

// The daily job that queues the evening question for every enrolled athlete.
//
// Why once a day rather than a frequent tick: Twilio schedules the message, so
// this job never needs to be running at the moment one should go out. That is
// what makes the whole thing viable on a plan whose crons fire anywhere inside
// a 59-minute window — precision is the provider's problem, and all this has to
// do is get every message queued at some point beforehand.
//
// Consequences of that jitter, both handled below:
//
//   Each run schedules roughly the next day, not the next few hours. A run that
//   nominally starts at 03:00 may start at 03:59, so anything due before ~05:00
//   risks landing inside Twilio's 15-minute floor by the time we get to it.
//
//   Consecutive runs therefore overlap. The unique constraint on
//   (userId, localDate, messageType) is what makes that safe: the second run
//   finds the row and skips rather than sending a second text.
//
// Every send is awaited. Vercel kills the function once the response is
// returned, so a fire-and-forget promise is a message that never leaves.

export const dynamic = "force-dynamic";

/** How long before lights-out to ask what time they're up. */
const EVENING_LEAD_MINUTES = 90;

/**
 * Don't queue anything further out than this. Comfortably more than a day, so
 * every timezone is covered by one run, and comfortably inside Twilio's 35-day
 * ceiling.
 */
const MAX_LOOKAHEAD_MS = 30 * 60 * 60 * 1000;

/**
 * Skip anything closer than this. Twilio's floor is 15 minutes; the margin
 * absorbs the cron's own jitter and the time this handler spends working
 * through the list. Anything skipped here is genuinely tonight's message
 * arriving too late to be worth sending, not a message lost.
 */
const MIN_LEAD_MS = 45 * 60 * 1000;

interface Candidate {
  id: string;
  ianaTimezone: string | null;
  age: number | null;
  biologicalSex: string | null;
  currentWakeTime: string | null;
  currentBedTime: string | null;
  planAggressiveness: number;
  bedtimeAdjustmentMinutes: number;
}

/**
 * Tonight's target bedtime for a given local date, as "HH:MM".
 *
 * Runs the real plan so the question arrives 90 minutes before the bedtime the
 * athlete is actually being asked to hit, which moves with training load and
 * meet proximity. Falls back to their stated habitual bedtime when the date
 * falls outside the plan window.
 */
async function bedtimeByLocalDate(user: Candidate): Promise<Map<string, string>> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(today);
  end.setDate(today.getDate() + 3);

  const [{ workouts }, meets] = await Promise.all([
    getWorkoutsForDateRange(user.id, today, end),
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
  );

  const byDate = new Map<string, string>();
  for (const plan of plans) {
    byDate.set(plan.date.toISOString().slice(0, 10), plan.recommendedBedtime);
  }
  return byDate;
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  // Housekeeping first, so a night left open by a missing reply is settled
  // before anything is queued for the night ahead. Runs for every athlete, not
  // just the ones being messaged today — a record left open by someone who has
  // since opted out still has to be closed rather than left dangling.
  const housekeeping = await closeUnresolvedNights(now);

  // Only athletes who finished onboarding, confirmed their number, and have not
  // opted out. The send gate checks all of this again per message — this is
  // narrowing the query, not enforcing the rule.
  const candidates = await prisma.user.findMany({
    where: {
      smsStatus: "ACTIVE",
      phoneVerifiedAt: { not: null },
      phoneNumber: { not: null },
      ianaTimezone: { not: null },
    },
    select: {
      id: true,
      ianaTimezone: true,
      age: true,
      biologicalSex: true,
      currentWakeTime: true,
      currentBedTime: true,
      planAggressiveness: true,
      bedtimeAdjustmentMinutes: true,
    },
  });

  const tally = { scheduled: 0, duplicate: 0, dryRun: 0, blocked: 0, failed: 0, skipped: 0 };

  for (const user of candidates) {
    const tz = user.ianaTimezone;
    if (!isValidTimeZone(tz)) {
      // A zone the runtime cannot resolve would make every instant below
      // meaningless. Louder than a skip because it means bad stored data.
      console.error(`[messaging] user=${user.id} has unusable timezone ${JSON.stringify(tz)}`);
      tally.failed++;
      continue;
    }

    let bedtimes: Map<string, string>;
    try {
      bedtimes = await bedtimeByLocalDate(user);
    } catch (e) {
      console.error(`[messaging] could not build a plan for user=${user.id}:`, e);
      tally.failed++;
      continue;
    }

    // Today and tomorrow in the athlete's own calendar. Two candidates covers
    // every timezone from one run: whichever of them is still far enough ahead
    // is the one to queue.
    const todayLocal = localDateOf(now, tz);
    let handled = false;

    for (const localDate of [todayLocal, addLocalDays(todayLocal, 1)]) {
      const bedtime = bedtimes.get(localDate) ?? user.currentBedTime ?? "22:00";
      const bedMinutes = clockToMinutes(bedtime);
      if (bedMinutes === null) continue;

      const sendClock = minutesToClock(bedMinutes - EVENING_LEAD_MINUTES);
      const { instant, exact } = instantFromLocal(localDate, sendClock, tz);
      if (!exact) {
        // Twice a year a send time can land in the hour a DST transition skips.
        // Worth a line in the log; the instant is still usable.
        console.warn(
          `[messaging] user=${user.id} ${localDate} ${sendClock} falls in a DST gap; using ${instant.toISOString()}`,
        );
      }

      const lead = instant.getTime() - now.getTime();
      if (lead < MIN_LEAD_MS) continue; // already gone, or too close to queue
      if (lead > MAX_LOOKAHEAD_MS) break; // a later run will pick it up

      const outcome = await sendMessage({
        userId: user.id,
        messageType: "EVENING_WAKE_QUESTION",
        body: eveningWakeQuestion(),
        localDate,
        sendAt: instant,
      });

      switch (outcome.status) {
        case "scheduled":
        case "sent":
          tally.scheduled++;
          break;
        case "dry_run":
          tally.dryRun++;
          break;
        case "duplicate":
          tally.duplicate++;
          break;
        case "blocked":
          tally.blocked++;
          break;
        default:
          tally.failed++;
      }
      handled = true;
      break;
    }

    if (!handled) tally.skipped++;
  }

  return NextResponse.json({
    ok: true,
    candidates: candidates.length,
    ...tally,
    nightsClosed: housekeeping.closed,
    nightsFlagged: housekeeping.flagged,
  });
}
