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
//
// Two channels now arrive here, and the channel is resolved once, at the top,
// before anything is written. The row records which one won, so the ledger
// stays the answer to "what did this athlete actually receive".
//
// Push cannot be scheduled by anyone but us — no push service offers a sendAt.
// A push with a future `sendAt` is therefore written as SCHEDULED with nothing
// handed to any provider, and lib/messaging/pushFlush.ts delivers it when it
// comes due. That is a real difference in reliability and it is worth stating
// plainly: a scheduled text survives this app being down, and a scheduled push
// does not.

import type { MessageChannel, MessageType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  dailySendCap,
  isDryRun,
  isEmailKillSwitchOn,
  isKillSwitchOn,
} from "@/lib/messaging/config";
import { evaluateSendGate, isOncePerDay, type BlockReason } from "@/lib/messaging/gate";
import { getProvider } from "@/lib/messaging/twilio";
import { getPushProvider } from "@/lib/messaging/push";
import { getEmailProvider } from "@/lib/messaging/email";
import { isPushKillSwitchOn } from "@/lib/push/vapid";
import { isSmsReady, resolveChannel, type NoChannelReason } from "@/lib/messaging/channel";
import {
  scheduleWindowFor,
  type OutboundOptions,
  type OutboundProvider,
  type Recipient,
} from "@/lib/messaging/provider";

export interface SendRequest {
  userId: string;
  messageType: MessageType;
  body: string;
  /** The athlete's local date this message belongs to, "YYYY-MM-DD". */
  localDate: string;
  /** Deliver at this instant. Omit to send immediately. */
  sendAt?: Date;
  /** Channel-specific extras. Ignored by SMS; used by push. */
  options?: OutboundOptions;
  /**
   * Force a channel, bypassing the athlete's preference. The one legitimate
   * use is a message that only makes sense on one road — a phone verification
   * code has to go to the phone being verified.
   */
  forceChannel?: MessageChannel;
}

export type SendOutcome =
  | { status: "scheduled"; sentMessageId: string; providerMessageSid: string | null; channel: MessageChannel }
  | { status: "sent"; sentMessageId: string; providerMessageSid: string | null; channel: MessageChannel }
  /** Written to the ledger, due later, waiting for the push flush pass. */
  | { status: "held"; sentMessageId: string; channel: MessageChannel }
  | { status: "dry_run"; sentMessageId: string; channel: MessageChannel }
  | { status: "duplicate" }
  | { status: "blocked"; reason: BlockReason }
  /** No channel could carry it. Nothing was refused; there is nowhere to send. */
  | { status: "no_channel"; reason: NoChannelReason }
  | { status: "failed"; reason: string };

const GATE_FIELDS = {
  id: true,
  phoneNumber: true,
  phoneVerifiedAt: true,
  smsStatus: true,
  ianaTimezone: true,
  channelPreference: true,
  email: true,
  name: true,
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

  // Which road, decided before anything is written or counted. A push provider
  // that is not configured makes push unavailable rather than broken, exactly
  // as absent Twilio credentials make SMS unavailable.
  const pushProvider = getPushProvider();
  const pushSubscriptionCount =
    pushProvider === null
      ? 0
      : await prisma.pushSubscription.count({ where: { userId: req.userId, disabledAt: null } });

  const emailProvider = getEmailProvider();

  const channelDecision = req.forceChannel
    ? { channel: req.forceChannel }
    : resolveChannel({
        preference: user.channelPreference,
        smsReady: isSmsReady(user),
        pushReady: pushProvider !== null && pushSubscriptionCount > 0,
        emailReady: emailProvider !== null && Boolean(user.email),
      });

  if (channelDecision.channel === null) {
    // Not a block — nothing refused this message, there is simply nowhere for
    // it to go. Kept distinct so the retention view can tell "we chose not to
    // message them" from "they never set up a way to be reached".
    return { status: "no_channel", reason: channelDecision.reason };
  }
  const channel: MessageChannel = channelDecision.channel;

  const sentToday = await countSentToday(req.userId, req.localDate);
  const decision = evaluateSendGate({
    subject: {
      phoneNumber: user.phoneNumber,
      phoneVerifiedAt: user.phoneVerifiedAt,
      smsStatus: user.smsStatus,
      ianaTimezone: user.ianaTimezone,
      hasPushSubscription: pushSubscriptionCount > 0,
      emailAddress: user.email,
    },
    messageType: req.messageType,
    sentToday,
    cap: dailySendCap(),
    // Each channel has its own brake. SMS_KILL_SWITCH stopping email would
    // make one flag mean two things, and the flag exists to be reached for in
    // a hurry.
    killSwitch:
      channel === "PUSH"
        ? isPushKillSwitchOn()
        : channel === "EMAIL"
          ? isEmailKillSwitchOn()
          : isKillSwitchOn(),
    channel,
  });

  if (!decision.allowed) {
    console.warn(
      `[messaging] blocked ${req.messageType} for user=${req.userId} date=${req.localDate} channel=${channel} reason=${decision.reason}`,
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

  const now = new Date();
  const recipient: Recipient =
    channel === "SMS"
      ? { channel: "SMS", phoneNumber: user.phoneNumber! }
      : channel === "EMAIL"
        ? { channel: "EMAIL", email: user.email, name: user.name }
        : { channel: "PUSH", userId: req.userId };

  // SMS_DRY_RUN governs texts only. Applying it to the other channels would
  // silence the two that exist during the pilot: the flag means "do not hand
  // anything to Twilio", and neither push nor email touches Twilio.
  const dryRun = channel === "SMS" && isDryRun();
  const provider: OutboundProvider | null = dryRun
    ? null
    : channel === "SMS"
      ? getProvider()
      : channel === "EMAIL"
        ? emailProvider
        : pushProvider;

  if (!dryRun && !provider) {
    console.error(
      channel === "SMS"
        ? "[messaging] SMS_DRY_RUN is off but Twilio is not configured, refusing to send"
        : channel === "EMAIL"
          ? "[messaging] email was selected but RESEND_API_KEY is not set, refusing to send"
          : "[messaging] push was selected but VAPID is not configured, refusing to send",
    );
    return { status: "failed", reason: "provider_not_configured" };
  }

  // Under an SMS dry run there is no provider object to ask, and the channel
  // being simulated is one that can schedule. Push is the only channel that
  // cannot, which is why the fallback is stated as "not push" rather than as a
  // list that would need editing every time a channel is added.
  const canSchedule = provider ? provider.canSchedule : channel !== "PUSH";

  // Decide how this goes out before writing anything, so the ledger row records
  // what was actually attempted.
  let mode: "schedule" | "hold" | "now";
  if (!req.sendAt) {
    mode = "now";
  } else if (!canSchedule) {
    // Nobody but us will hold this. Already due means send it; otherwise the
    // row is the queue, and lib/messaging/pushFlush.ts is what drains it.
    mode = req.sendAt.getTime() <= now.getTime() ? "now" : "hold";
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

  // A held push is SCHEDULED in the ledger for the same reason a Twilio one is:
  // it is a message with a future send time that has not gone out. What differs
  // is who is holding it, and that is answerable from `channel`.
  const intendedStatus = dryRun
    ? "DRY_RUN"
    : mode === "schedule" || mode === "hold"
      ? "SCHEDULED"
      : "SENT";
  const scheduledFor = mode === "schedule" || mode === "hold" ? req.sendAt ?? null : null;

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
      channel,
      status: intendedStatus,
      body: req.body,
      scheduledFor,
      sentAt: mode === "now" ? now : null,
    },
    update: {
      channel,
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
        `  to:        ${user.phoneNumber}`,
        `  localDate: ${req.localDate}`,
        mode === "schedule"
          ? `  sendAt:    ${req.sendAt!.toISOString()}`
          : "  sendAt:    immediate",
        `  body:      ${JSON.stringify(req.body)}`,
      ].join("\n"),
    );
    return { status: "dry_run", sentMessageId: row.id, channel };
  }

  if (mode === "hold") {
    // Deliberately nothing else. The row is the queue; the flush pass owns it
    // from here. Returning before any provider call is what keeps a held
    // message from being a half-sent one.
    return { status: "held", sentMessageId: row.id, channel };
  }

  const result =
    mode === "schedule"
      ? await provider.schedule(recipient, req.body, req.sendAt!, req.options)
      : await provider.sendNow(recipient, req.body, req.options);

  if (!result.ok) {
    await prisma.sentMessage.update({
      where: { id: row.id },
      data: { status: "FAILED" },
    });
    console.error(
      `[messaging] send failed type=${req.messageType} user=${req.userId} channel=${channel}: ${result.error}`,
    );
    return { status: "failed", reason: result.error ?? "provider_error" };
  }

  await prisma.sentMessage.update({
    where: { id: row.id },
    data: { providerMessageSid: result.providerMessageSid },
  });

  return mode === "schedule"
    ? {
        status: "scheduled",
        sentMessageId: row.id,
        providerMessageSid: result.providerMessageSid,
        channel,
      }
    : {
        status: "sent",
        sentMessageId: row.id,
        providerMessageSid: result.providerMessageSid,
        channel,
      };
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

  const provider: OutboundProvider | null = isDryRun() ? null : getProvider();
  let closed = 0;

  for (const row of rows) {
    if (!row.providerMessageSid || !provider) {
      // A DRY_RUN row, one that never got a SID, or a held push — none of them
      // has anything queued at a provider, so closing the ledger is the whole
      // job. A held push is the important case: the row IS the queue, and
      // flipping it to CANCELED is exactly what stops the flush pass sending
      // it. That is also why push cancellation is reliable in a way scheduling
      // is not — nothing has left the building yet.
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
