// Delivers push messages whose time has come.
//
// The SMS layer never needed this: Twilio holds a scheduled text and sends it
// on the minute, which is what lets the cron run once a day at whatever moment
// it likes. No push service offers the equivalent, so a scheduled push sits in
// our own ledger as a SCHEDULED row with a future `scheduledFor`, and something
// has to come along and notice it is due.
//
// This is that something. It is deliberately a plain function rather than a
// route, so it can be called from more than one trigger — see
// app/api/cron/push-flush/route.ts for the discussion of what actually calls it
// and how often, which is the load-bearing operational question here.
//
// Two properties matter:
//
//   It is idempotent. A row is claimed by flipping it out of SCHEDULED before
//   the provider is called, so two overlapping runs cannot both send it.
//
//   It never sends a stale message. "What time are you up tomorrow?" arriving
//   at noon the next day is not late, it is wrong — so a row that is overdue by
//   more than the grace window is closed as FAILED rather than delivered.

import { prisma } from "@/lib/prisma";
import { getPushProvider } from "@/lib/messaging/push";
import { isPushKillSwitchOn } from "@/lib/push/vapid";

/**
 * How late a message may be and still be worth sending.
 *
 * Two hours. Long enough to absorb a missed trigger or a slow run; short
 * enough that an evening question never lands after the athlete is asleep and
 * a morning verdict never arrives in the afternoon.
 */
const STALE_AFTER_MS = 2 * 60 * 60 * 1000;

/** Ceiling on one pass, so a backlog cannot run the function past its timeout. */
const MAX_PER_RUN = 200;

export interface FlushResult {
  /** Rows that were due and went out. */
  sent: number;
  /** Rows that were due, attempted, and failed. */
  failed: number;
  /** Rows abandoned for being past the point of usefulness. */
  stale: number;
  /** True when the batch ceiling was hit and more remain. */
  more: boolean;
}

const EMPTY: FlushResult = { sent: 0, failed: 0, stale: 0, more: false };

/**
 * Sends every push message that is due, and abandons every one that is too
 * late to mean anything.
 *
 * `now` is injectable so the behaviour around the staleness boundary is
 * testable without waiting two hours.
 */
export async function flushDuePushMessages(now: Date = new Date()): Promise<FlushResult> {
  const provider = getPushProvider();
  if (!provider) return EMPTY;
  if (isPushKillSwitchOn()) {
    console.warn("[push] flush skipped — PUSH_KILL_SWITCH is on");
    return EMPTY;
  }

  const due = await prisma.sentMessage.findMany({
    where: {
      channel: "PUSH",
      status: "SCHEDULED",
      scheduledFor: { lte: now },
    },
    orderBy: { scheduledFor: "asc" },
    take: MAX_PER_RUN,
    select: {
      id: true,
      userId: true,
      body: true,
      messageType: true,
      scheduledFor: true,
    },
  });
  if (due.length === 0) return EMPTY;

  const result: FlushResult = { sent: 0, failed: 0, stale: 0, more: due.length === MAX_PER_RUN };

  for (const row of due) {
    const overdueBy = row.scheduledFor ? now.getTime() - row.scheduledFor.getTime() : 0;
    if (overdueBy > STALE_AFTER_MS) {
      await prisma.sentMessage.update({
        where: { id: row.id },
        data: { status: "FAILED" },
      });
      console.warn(
        `[push] abandoned ${row.messageType} for user=${row.userId}: ${Math.round(
          overdueBy / 60_000,
        )} minutes overdue`,
      );
      result.stale++;
      continue;
    }

    // Claim it before sending. If the process dies mid-send the row reads SENT
    // and nobody sends it again — the same trade the SMS layer makes, and the
    // same reasoning: a message that silently didn't arrive is a disappointment,
    // and one that arrives twice at 06:00 costs us the athlete's trust.
    const claimed = await prisma.sentMessage.updateMany({
      where: { id: row.id, status: "SCHEDULED" },
      data: { status: "SENT", sentAt: now },
    });
    if (claimed.count === 0) continue; // another pass got there first

    const outcome = await provider.sendNow({ channel: "PUSH", userId: row.userId }, row.body, {
      // One tag per message type, so a re-sent morning message replaces the one
      // already on the lock screen rather than stacking a second, contradictory
      // copy beneath it.
      tag: row.messageType,
    });

    if (outcome.ok) {
      result.sent++;
    } else {
      await prisma.sentMessage.update({
        where: { id: row.id },
        data: { status: "FAILED", sentAt: null },
      });
      console.error(
        `[push] flush failed ${row.messageType} for user=${row.userId}: ${outcome.error}`,
      );
      result.failed++;
    }
  }

  return result;
}
