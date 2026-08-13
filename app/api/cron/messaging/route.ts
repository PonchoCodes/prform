import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calculateSleepPlan } from "@/lib/sleepAlgorithm";
import { getWorkoutsForDateRange } from "@/lib/workoutDataSource";
import { sendMessage } from "@/lib/messaging/send";
import { scheduleMorning } from "@/lib/messaging/morning";
import { closeUnresolvedNights } from "@/lib/messaging/night";
import { flushDuePushMessages } from "@/lib/messaging/pushFlush";
import { eveningWakeQuestion } from "@/lib/messaging/copy";
import { EVENING_LEAD_MINUTES } from "@/lib/messaging/config";
import type { DailySleepPlan } from "@/lib/sleepAlgorithm";
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
 * The athlete's plan days, keyed by the date each night begins.
 *
 * Runs the real plan so the evening question arrives 90 minutes before the
 * bedtime the athlete is actually being asked to hit, and so the morning
 * message carries the verdict for the night it follows. Starts a day back
 * because this cron fires at a UTC hour where much of the world's local date
 * is still the server's yesterday; without that day the athlete's "tonight"
 * would fall outside the map.
 */
async function planByLocalDate(user: Candidate): Promise<Map<string, DailySleepPlan>> {
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
    { startDayOffset: -1 },
  );

  const byDate = new Map<string, DailySleepPlan>();
  for (const plan of plans) {
    byDate.set(plan.date.toISOString().slice(0, 10), plan);
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

  // Opportunistic, not the real trigger. Anything push-shaped that came due
  // since the last flush goes out now, so the queue still drains if the
  // dedicated five-minute trigger is not set up (see the header comment in
  // app/api/cron/push-flush/route.ts). Once a day is not a schedule a push
  // channel can be run on — this only means a daily-cron-only deployment
  // degrades rather than silently accumulating a queue nobody drains.
  const pushFlush = await flushDuePushMessages(now);

  // Everyone reachable on some channel: a confirmed phone number, or at least
  // one live push subscription. The send gate checks all of this again per
  // message — this is narrowing the query, not enforcing the rule.
  //
  // The OR is what admits the pilot's athletes at all. Before push, this query
  // asked for a verified phone number and nothing else, so a user who had
  // installed the app and enabled notifications but never given us a number
  // matched nothing and was never messaged.
  //
  // A timezone is still required of everyone, because "the athlete's evening"
  // cannot be computed without one. For a push user it is captured by
  // /api/push/subscribe from the browser rather than typed into a form.
  //
  // Email is deliberately NOT in this OR. Every account has an address, so
  // including it would enrol the entire user base in a daily message nobody
  // asked for. Email is a fallback for an athlete who has opted into being
  // messaged and has no better channel, not an opt-out mailing list, so an
  // athlete reaches it by setting channelPreference to EMAIL.
  const candidates = await prisma.user.findMany({
    where: {
      ianaTimezone: { not: null },
      OR: [
        { smsStatus: "ACTIVE", phoneVerifiedAt: { not: null }, phoneNumber: { not: null } },
        { pushSubscriptions: { some: { disabledAt: null } } },
        { channelPreference: "EMAIL" },
      ],
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

  const tally = {
    scheduled: 0,
    held: 0,
    duplicate: 0,
    dryRun: 0,
    blocked: 0,
    noChannel: 0,
    failed: 0,
    skipped: 0,
  };

  for (const user of candidates) {
    const tz = user.ianaTimezone;
    if (!isValidTimeZone(tz)) {
      // A zone the runtime cannot resolve would make every instant below
      // meaningless. Louder than a skip because it means bad stored data.
      console.error(`[messaging] user=${user.id} has unusable timezone ${JSON.stringify(tz)}`);
      tally.failed++;
      continue;
    }

    let plans: Map<string, DailySleepPlan>;
    try {
      plans = await planByLocalDate(user);
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
      const bedtime = plans.get(localDate)?.recommendedBedtime ?? user.currentBedTime ?? "22:00";
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
        // Routes by channel. On push it lands as a notification that opens the
        // dashboard — there is no reply-by-text on that road, so the tap has to
        // land somewhere the athlete can answer.
        options: { tag: "EVENING_WAKE_QUESTION", url: "/dashboard" },
      });

      switch (outcome.status) {
        case "scheduled":
        case "sent":
          tally.scheduled++;
          break;
        // Queued in our own ledger for the push flush pass rather than handed
        // to a provider. Counted separately because the two have different
        // reliability: a scheduled text survives this app being down.
        case "held":
          tally.held++;
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
        case "no_channel":
          tally.noChannel++;
          break;
        default:
          tally.failed++;
      }
      handled = true;
      break;
    }

    // The morning message, scheduled on its own window rather than piggybacked
    // on the evening question. At the hour this cron usually fires, tonight's
    // evening question is already inside its floor and skipped — but tonight's
    // morning verdict is still hours ahead, and for a push or email athlete
    // this is the only place it can come from: they have no reply that would
    // schedule one. An SMS reply later tonight still wins — the inbound
    // handler cancels and re-schedules at the declared wake time, while this
    // pass never replaces an existing row.
    for (const nightDate of [todayLocal, addLocalDays(todayLocal, 1)]) {
      const wakeClock =
        plans.get(nightDate)?.recommendedWakeTime ?? user.currentWakeTime ?? "06:00";
      const morningDate = addLocalDays(nightDate, 1);
      const { instant } = instantFromLocal(morningDate, wakeClock, tz);

      const lead = instant.getTime() - now.getTime();
      if (lead < MIN_LEAD_MS) continue;
      if (lead > MAX_LOOKAHEAD_MS) break;

      try {
        const outcome = await scheduleMorning({
          user,
          nightDate,
          wakeInstant: instant,
          // Asked because nothing is known yet at schedule time. A BED reply
          // tonight re-schedules without the question; an athlete who logs in
          // the app answers it there.
          askForBedtime: true,
          replaceExisting: false,
          plans,
        });
        switch (outcome?.status) {
          case "scheduled":
          case "sent":
            tally.scheduled++;
            break;
          case "held":
            tally.held++;
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
          case "no_channel":
            tally.noChannel++;
            break;
          case undefined:
            break;
          default:
            tally.failed++;
        }
      } catch (e) {
        console.error(`[messaging] morning schedule failed for user=${user.id}:`, e);
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
    pushFlush,
  });
}
