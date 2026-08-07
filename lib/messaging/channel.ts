// Which road a scheduled message takes to one athlete.
//
// Pure, so every combination is testable without a database or a network —
// same construction as lib/messaging/gate.ts, and for the same reason: this
// decides whether a teenager hears from us at all, and that decision should be
// readable in one screen rather than inferred from four call sites.
//
// The gate and this file answer different questions and both have to pass. The
// gate asks "is this athlete allowed to be messaged"; this asks "and by what
// means". A channel resolving to null is not a block — nothing was refused,
// there is simply nowhere to send.

import type { ChannelPreference, MessageChannel } from "@prisma/client";

export type NoChannelReason =
  /** Nothing set up at all: no verified number, no device, no email. */
  | "nothing_configured"
  /** They asked for texts specifically, and texts are not ready for them. */
  | "sms_not_ready"
  /** They asked for notifications specifically, and none can be delivered. */
  | "push_not_ready"
  /** They asked for email specifically, and it cannot be sent. */
  | "email_not_ready";

export type ChannelDecision =
  | { channel: MessageChannel }
  | { channel: null; reason: NoChannelReason };

export interface ChannelSubject {
  preference: ChannelPreference;
  /**
   * A verified, active number in a known timezone. Precisely the conditions
   * lib/messaging/gate.ts would let an SMS through on — computed by the caller
   * from the same fields so the two cannot disagree about what "ready" means.
   */
  smsReady: boolean;
  /** At least one live push subscription, and VAPID actually configured. */
  pushReady: boolean;
  /**
   * An address on file and Resend configured. Every account has an email by
   * definition, so this is nearly always true, which is exactly why it sits
   * last in the AUTO ladder: it is the floor, not a choice.
   */
  emailReady: boolean;
}

/**
 * Resolves the channel.
 *
 * AUTO goes SMS, then push, then email, and the order is a ranking of how
 * likely a message is to be read by a sixteen-year-old at 21:00.
 *
 *   SMS needs nothing installed, survives a phone that has cleared its site
 *   data, and lands in a thread they already read. It is the channel the
 *   product was designed around.
 *
 *   Push lands on the same lock screen but needs an installed app, and on iOS
 *   needs it installed before the permission can even be requested.
 *
 *   Email is the floor. Every account has an address, so this branch always
 *   catches, and an athlete who will not install a PWA and will not give a
 *   phone number is otherwise unreachable. It is the weakest channel for a
 *   bedtime nudge and the right answer only when the other two are absent:
 *   unreachable is worse than slow.
 *
 * An explicit choice is honoured strictly, with no substitution. A stated
 * preference is an instruction rather than a hint: an athlete who asked for
 * texts and quietly got an email instead has been overruled by software, and
 * the reason returned here makes the resulting silence diagnosable rather than
 * mysterious. The UI only offers a channel that is actually set up.
 */
export function resolveChannel(subject: ChannelSubject): ChannelDecision {
  const { preference, smsReady, pushReady, emailReady } = subject;

  if (preference === "SMS") {
    return smsReady ? { channel: "SMS" } : { channel: null, reason: "sms_not_ready" };
  }
  if (preference === "PUSH") {
    return pushReady ? { channel: "PUSH" } : { channel: null, reason: "push_not_ready" };
  }
  if (preference === "EMAIL") {
    return emailReady ? { channel: "EMAIL" } : { channel: null, reason: "email_not_ready" };
  }

  if (smsReady) return { channel: "SMS" };
  if (pushReady) return { channel: "PUSH" };
  if (emailReady) return { channel: "EMAIL" };
  return { channel: null, reason: "nothing_configured" };
}

/**
 * Whether the SMS half of the athlete's setup is complete. Mirrors the rails in
 * evaluateSendGate that concern reachability — not the ones that concern
 * permission (STOP, the daily cap), which stay the gate's job.
 */
export function isSmsReady(user: {
  phoneNumber: string | null;
  phoneVerifiedAt: Date | null;
  smsStatus: "UNVERIFIED" | "ACTIVE" | "STOPPED";
  ianaTimezone: string | null;
}): boolean {
  return (
    user.phoneNumber !== null &&
    user.phoneVerifiedAt !== null &&
    user.smsStatus === "ACTIVE" &&
    user.ianaTimezone !== null
  );
}
