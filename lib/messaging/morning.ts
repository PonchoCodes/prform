// Scheduling the morning message, shared by the two places that create one.
//
// The daily cron pre-schedules it for every reachable athlete at the plan's
// recommended wake time, which is what makes the morning message exist at all
// on channels with no reply path — a push or email athlete never declares a
// wake time by text, and before the cron owned this, only an SMS reply could
// bring a morning message into being.
//
// The inbound handler re-schedules it when better information arrives: a
// declared wake time moves the send instant, a BED reply removes the question
// from the text. Both use the same function; the difference is `replaceExisting`.
//
// The text is fixed at schedule time — see the header of
// app/api/messaging/inbound/route.ts for why that is the accepted price.

import { prisma } from "@/lib/prisma";
import { cancelScheduled, sendMessage, type SendOutcome } from "@/lib/messaging/send";
import { planIndexFor, type PlanUser } from "@/lib/messaging/plan";
import { addLocalDays, type LocalDate } from "@/lib/messaging/time";
import { morningMessage, verdictHeadline } from "@/lib/messaging/copy";
import { computeCheckInStreak, streakSentence } from "@/lib/streak";
import { verdictForUser, VERDICT_USER_SELECT } from "@/lib/messaging/verdictFor";
import type { DailySleepPlan } from "@/lib/sleepAlgorithm";

/**
 * Queues (or re-queues) the morning message for `wakeInstant`.
 *
 * With `replaceExisting` (the inbound path) anything already queued for that
 * morning is cancelled first — a wake time revised at 22:00 and a BED reply at
 * 21:30 both invalidate text already sitting in a provider's schedule, and
 * both route through the same cancellation the STOP path uses.
 *
 * Without it (the cron path) an existing row wins: the cron must never stomp a
 * message the athlete's own reply placed at their declared wake time. The
 * once-per-day constraint inside `sendMessage` is what enforces that, so the
 * cron re-running is a `duplicate` outcome rather than a second message.
 */
export async function scheduleMorning(input: {
  user: PlanUser;
  nightDate: LocalDate;
  wakeInstant: Date;
  askForBedtime: boolean;
  replaceExisting: boolean;
  /** Reuses the caller's plan when it already built one. */
  plans?: Map<string, DailySleepPlan>;
}): Promise<SendOutcome | null> {
  const morningDate = addLocalDays(input.nightDate, 1);
  if (input.replaceExisting) {
    await cancelScheduled({
      userId: input.user.id,
      localDate: morningDate,
      messageType: "MORNING_VERDICT",
    });
  }

  const plans = input.plans ?? (await planIndexFor(input.user));
  const todayPlan = plans.get(input.nightDate);
  if (!todayPlan) {
    console.error(
      `[messaging] no plan day for ${input.nightDate}; morning message not scheduled for user=${input.user.id}`,
    );
    return null;
  }

  const verdictUser = await prisma.user.findUnique({
    where: { id: input.user.id },
    select: VERDICT_USER_SELECT,
  });
  if (!verdictUser) return null;

  const verdict = await verdictForUser(
    verdictUser,
    todayPlan,
    plans.get(addLocalDays(input.nightDate, 1)),
  );

  // Dates only — the streak is a habit measure and must not see a duration.
  // Computed as of the morning the message lands, not tonight, because that is
  // when the athlete reads it and what the number has to be true of.
  const [loggedDates, holds] = await Promise.all([
    prisma.sleepLog.findMany({
      where: { userId: input.user.id },
      select: { date: true },
      orderBy: { date: "desc" },
      take: 400,
    }),
    prisma.streakHold.findMany({
      where: { userId: input.user.id },
      select: { startsOn: true, endsOn: true },
    }),
  ]);
  const streak = computeCheckInStreak({
    loggedDates: loggedDates.map((l) => l.date.toISOString().slice(0, 10)),
    today: morningDate,
    holds: holds.map((h) => ({
      startsOn: h.startsOn.toISOString().slice(0, 10),
      endsOn: h.endsOn.toISOString().slice(0, 10),
    })),
  });

  return sendMessage({
    userId: input.user.id,
    messageType: "MORNING_VERDICT",
    body: morningMessage({
      headline: verdictHeadline(verdict),
      askForBedtime: input.askForBedtime,
      streak: streakSentence(streak),
    }),
    localDate: morningDate,
    sendAt: input.wakeInstant,
    // Not pinned: this is a scheduled message, not a reply, so it goes by
    // whichever channel the athlete is actually set up on. The tag collapses a
    // re-scheduled notification onto the one already showing; the url is where
    // a tap lands, which for the morning question is the confirmation card.
    options: { tag: "MORNING_VERDICT", url: "/dashboard" },
  });
}
