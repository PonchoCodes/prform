// The single path by which any message reaches an athlete.
//
// Two invariants hold everything together:
//
//   1. The ledger row is written before the provider is called. If the process
//      dies between the two, the retry finds the row and stops. That trades a
//      missed message for never sending a duplicate, which is the right way
//      round: a teenager who gets no text is mildly let down, and one who gets
//      the same text twice at 06:00 stops trusting the thing.
//
//   2. Nothing bypasses `sendMessage`. The daily cap is counted from the
//      ledger, so a send that skipped the ledger would be a send the cap cannot
//      see.

import type { MessageType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { dailySendCap, isDryRun, isKillSwitchOn } from "@/lib/messaging/config";
import { evaluateSendGate, isOncePerDay, type BlockReason } from "@/lib/messaging/gate";
import { getProvider } from "@/lib/messaging/twilio";
import { scheduleWindowFor, type MessageProvider } from "@/lib/messaging/provider";

export interface SendRequest {
  userId: string;
  messageType: MessageType;
  body: string;
  /** The athlete's local date this message belongs to, "YYYY-MM-DD". */
  localDate: string;
  /** Deliver at this instant. Omit to send immediately. */
  sendAt?: Date;
}

export type SendOutcome =
  | { status: "scheduled"; sentMessageId: string; providerMessageSid: string | null }
  | { status: "sent"; sentMessageId: string; providerMessageSid: string | null }
  | { status: "dry_run"; sentMessageId: string }
  | { status: "duplicate" }
  | { status: "blocked"; reason: BlockReason }
  | { status: "failed"; reason: string };

const GATE_FIELDS = {
  id: true,
  phoneNumber: true,
  phoneVerifiedAt: true,
  smsStatus: true,
  ianaTimezone: true,
} as const;

/** Messages already counted against this athlete on this local date. */
async function countSentToday(userId: string, localDate: string): Promise<number> {
  const agg = await prisma.sentMessage.aggregate({
    where: {
      userId,
      localDate,
      // A message we cancelled or that the provider refused never reached
      // anyone, so it must not consume the day's allowance.
      status: { notIn: ["CANCELED", "FAILED"] },
    },
    _sum: { sendCount: true },
  });
  return agg._sum.sendCount ?? 0;
}

export async function sendMessage(req: SendRequest): Promise<SendOutcome> {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: GATE_FIELDS,
  });
  if (!user) return { status: "failed", reason: "user_not_found" };

  const sentToday = await countSentToday(req.userId, req.localDate);
  const decision = evaluateSendGate({
    subject: {
      phoneNumber: user.phoneNumber,
      phoneVerifiedAt: user.phoneVerifiedAt,
      smsStatus: user.smsStatus,
      ianaTimezone: user.ianaTimezone,
    },
    messageType: req.messageType,
    sentToday,
    cap: dailySendCap(),
    killSwitch: isKillSwitchOn(),
  });

  if (!decision.allowed) {
    console.warn(
      `[messaging] blocked ${req.messageType} for user=${req.userId} date=${req.localDate} reason=${decision.reason}`,
    );
    return { status: "blocked", reason: decision.reason };
  }

  // The cron's own retry guard. Only the once-a-day types are suppressed;
  // a clarification reply is allowed to happen twice because the athlete can
  // legitimately send two unparseable messages.
  if (isOncePerDay(req.messageType)) {
    const existing = await prisma.sentMessage.findUnique({
      where: {
        userId_localDate_messageType: {
          userId: req.userId,
          localDate: req.localDate,
          messageType: req.messageType,
        },
      },
      select: { id: true, status: true },
    });
    if (existing && existing.status !== "CANCELED" && existing.status !== "FAILED") {
      return { status: "duplicate" };
    }
  }

  const to = user.phoneNumber!;
  const now = new Date();

  // Decide how this goes out before writing anything, so the ledger row records
  // what was actually attempted.
  let mode: "schedule" | "now";
  if (!req.sendAt) {
    mode = "now";
  } else {
    const window = scheduleWindowFor(req.sendAt, now);
    if (window === "too_far") {
      // Nothing sensible to do this far ahead; the next daily run will pick it
      // up inside the window.
      return { status: "failed", reason: "send_at_beyond_schedule_ceiling" };
    }
    // Inside the provider's floor the API would reject the schedule outright.
    // The message is still wanted — a wake time declared ten minutes before it
    // arrives is the commonest version of this — so it goes immediately rather
    // than failing silently.
    mode = window === "too_soon" ? "now" : "schedule";
  }

  const dryRun = isDryRun();
  const provider = dryRun ? null : getProvider();
  if (!dryRun && !provider) {
    console.error(
      "[messaging] SMS_DRY_RUN is off but Twilio is not configured — refusing to send",
    );
    return { status: "failed", reason: "provider_not_configured" };
  }

  const intendedStatus = dryRun ? "DRY_RUN" : mode === "schedule" ? "SCHEDULED" : "SENT";
  const scheduledFor = mode === "schedule" ? req.sendAt ?? null : null;

  // Reserve first. See invariant 1 at the top of the file.
  const row = await prisma.sentMessage.upsert({
    where: {
      userId_localDate_messageType: {
        userId: req.userId,
        localDate: req.localDate,
        messageType: req.messageType,
      },
    },
    create: {
      userId: req.userId,
      localDate: req.localDate,
      messageType: req.messageType,
      status: intendedStatus,
      body: req.body,
      scheduledFor,
      sentAt: mode === "now" ? now : null,
    },
    update: {
      status: intendedStatus,
      body: req.body,
      scheduledFor,
      sentAt: mode === "now" ? now : null,
      providerMessageSid: null,
      sendCount: { increment: 1 },
    },
    select: { id: true },
  });

  if (dryRun || !provider) {
    console.info(
      [
        "[messaging][DRY RUN] nothing was sent",
        `  type:      ${req.messageType}`,
        `  to:        ${to}`,
        `  localDate: ${req.localDate}`,
        mode === "schedule"
          ? `  sendAt:    ${req.sendAt!.toISOString()}`
          : "  sendAt:    immediate",
        `  body:      ${JSON.stringify(req.body)}`,
      ].join("\n"),
    );
    return { status: "dry_run", sentMessageId: row.id };
  }

  const result =
    mode === "schedule"
      ? await provider.schedule(to, req.body, req.sendAt!)
      : await provider.sendNow(to, req.body);

  if (!result.ok) {
    await prisma.sentMessage.update({
      where: { id: row.id },
      data: { status: "FAILED" },
    });
    console.error(
      `[messaging] send failed type=${req.messageType} user=${req.userId}: ${result.error}`,
    );
    return { status: "failed", reason: result.error ?? "provider_error" };
  }

  await prisma.sentMessage.update({
    where: { id: row.id },
    data: { providerMessageSid: result.providerMessageSid },
  });

  return mode === "schedule"
    ? { status: "scheduled", sentMessageId: row.id, providerMessageSid: result.providerMessageSid }
    : { status: "sent", sentMessageId: row.id, providerMessageSid: result.providerMessageSid };
}

// ── cancellation ─────────────────────────────────────────────────────────────

export interface CancelScope {
  userId: string;
  /** Restrict to one local date. Omit to cover every future scheduled message. */
  localDate?: string;
  messageType?: MessageType;
}

/**
 * Cancels scheduled messages that have not gone out yet.
 *
 * Both callers route through here on purpose. STOP and "the athlete changed
 * their declared wake time" are the same operation — a message we queued is no
 * longer wanted — and giving them one implementation means the opt-out path
 * cannot quietly diverge from the one that gets exercised every day.
 *
 * Returns the number of rows closed out.
 */
export async function cancelScheduled(scope: CancelScope): Promise<number> {
  const rows = await prisma.sentMessage.findMany({
    where: {
      userId: scope.userId,
      status: "SCHEDULED",
      ...(scope.localDate ? { localDate: scope.localDate } : {}),
      ...(scope.messageType ? { messageType: scope.messageType } : {}),
    },
    select: { id: true, providerMessageSid: true, messageType: true },
  });
  if (rows.length === 0) return 0;

  const provider: MessageProvider | null = isDryRun() ? null : getProvider();
  let closed = 0;

  for (const row of rows) {
    if (!row.providerMessageSid || !provider) {
      // A DRY_RUN row, or one that never got a SID, has nothing queued at the
      // provider — closing the ledger is the whole job.
      await prisma.sentMessage.update({ where: { id: row.id }, data: { status: "CANCELED" } });
      closed++;
      continue;
    }

    const result = await provider.cancel(row.providerMessageSid);
    if (result.ok || result.alreadyResolved) {
      await prisma.sentMessage.update({ where: { id: row.id }, data: { status: "CANCELED" } });
      closed++;
      if (result.alreadyResolved) {
        console.warn(
          `[messaging] ${row.messageType} ${row.providerMessageSid} could not be cancelled (already sent or unknown)`,
        );
      }
    } else {
      // Left SCHEDULED deliberately: an uncancelled message is still out there,
      // and the row is the only record that says so.
      console.error(
        `[messaging] cancel failed for ${row.providerMessageSid}: ${result.error}`,
      );
    }
  }

  return closed;
}

/**
 * Everything queued for an athlete, cancelled. This is the STOP path: someone
 * who opts out at 21:00 must not receive the 06:00 message that is already
 * sitting in Twilio's schedule.
 */
export function cancelAllScheduled(userId: string): Promise<number> {
  return cancelScheduled({ userId });
}
