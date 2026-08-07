// Whether a given message is allowed to leave the building, decided as a pure
// function so every combination can be tested without a database or a network.
//
// The rails are ordered by severity, and the order is the contract: the reason
// reported is the most serious one that applies, so a log line reading
// "not_verified" can never be masking "stopped".
//
// The gate is channel-aware, and defaults to SMS so that every caller written
// before push existed still means what it said. Two rails differ by channel and
// one deliberately does not:
//
//   Reachability is per channel. A number and a verification are what SMS
//   needs; a live subscription is what push needs. Checking a phone number
//   before a push would block the entire pilot, whose athletes have no number
//   on file at all.
//
//   The timezone is required by both. It is not about reaching anyone — it is
//   how "the athlete's Tuesday" is computed, and without it a message cannot be
//   scheduled or filed on either channel.
//
//   STOP silences everything, on every channel. It is an SMS-shaped word and
//   only carriers require it, but somebody who tells us to stop has told us to
//   stop; delivering the same message by another road because the letter of the
//   rule allows it is how a product loses a person for good. Re-enabling is a
//   thing they do, not a thing we infer.

import type { MessageType } from "@prisma/client";

export type BlockReason =
  /** The global brake is on. Nothing goes out. */
  | "kill_switch"
  /** No number on file — there is nowhere to send. */
  | "no_phone_number"
  /** No subscribed device — the push equivalent of no number. */
  | "no_push_subscription"
  /** No address on file. Should be impossible; every account has one. */
  | "no_email_address"
  /** No timezone, so the athlete's local day cannot be computed. */
  | "no_timezone"
  /** They texted STOP. This is the one that gets a sending number blocked. */
  | "stopped"
  /** Never confirmed a verification code. */
  | "not_verified"
  /** Already had their allowance for the day. */
  | "daily_cap";

export interface GateSubject {
  phoneNumber: string | null;
  phoneVerifiedAt: Date | null;
  smsStatus: "UNVERIFIED" | "ACTIVE" | "STOPPED";
  ianaTimezone: string | null;
  /**
   * Whether at least one live push subscription exists. Optional so that every
   * SMS-era caller compiles unchanged; only read when the channel is PUSH.
   */
  hasPushSubscription?: boolean;
  /** Only read when the channel is EMAIL. */
  emailAddress?: string | null;
}

export type GateDecision =
  | { allowed: true }
  | { allowed: false; reason: BlockReason };

const ALLOWED = { allowed: true } as const;

/**
 * The one message type that may go to an unverified number — a verification
 * code has to reach a number precisely because it has not been verified yet.
 * Every other rail still applies to it, including STOP and the daily cap, so
 * this carve-out cannot be used to text someone who asked us not to.
 */
const BYPASSES_VERIFICATION: ReadonlySet<string> = new Set<string>(["VERIFICATION_CODE"]);

export function evaluateSendGate(input: {
  subject: GateSubject;
  messageType: MessageType;
  /** Messages already sent to this athlete on this local date. */
  sentToday: number;
  cap: number;
  killSwitch: boolean;
  /** Which road the message would take. Defaults to SMS. */
  channel?: "SMS" | "PUSH" | "EMAIL";
}): GateDecision {
  const { subject, messageType, sentToday, cap, killSwitch } = input;
  const channel = input.channel ?? "SMS";

  if (killSwitch) return { allowed: false, reason: "kill_switch" };

  // Reachability, per channel.
  if (channel === "SMS") {
    if (!subject.phoneNumber) return { allowed: false, reason: "no_phone_number" };
  } else if (channel === "PUSH") {
    if (!subject.hasPushSubscription) {
      return { allowed: false, reason: "no_push_subscription" };
    }
  } else if (!subject.emailAddress) {
    return { allowed: false, reason: "no_email_address" };
  }

  // Not channel-specific: this is how the athlete's local day is computed, and
  // both channels file and schedule against it.
  if (!subject.ianaTimezone) return { allowed: false, reason: "no_timezone" };

  // Checked before verification so that someone who opted out and whose record
  // was later reset cannot be texted on the strength of the weaker check. Not
  // conditioned on the channel: see the note at the top of the file.
  if (subject.smsStatus === "STOPPED") return { allowed: false, reason: "stopped" };

  // Verification is about a phone number, so it is asked about only when the
  // message is going to one. A push has already been consented to by the act of
  // granting the browser permission, on the device it will arrive on.
  if (channel === "SMS" && !BYPASSES_VERIFICATION.has(messageType)) {
    // Both conditions, deliberately. They should always agree; if they ever
    // disagree the safe reading is that this athlete is not confirmed.
    if (subject.phoneVerifiedAt === null) return { allowed: false, reason: "not_verified" };
    if (subject.smsStatus !== "ACTIVE") return { allowed: false, reason: "not_verified" };
  }

  // Counted across both channels, from one ledger. The cap protects the
  // athlete's attention, and their attention does not have separate budgets for
  // a text and a notification.
  if (sentToday >= cap) return { allowed: false, reason: "daily_cap" };

  return ALLOWED;
}

/**
 * Message types the daily cron owns, at most one per athlete per local day.
 * A second attempt is a retry, and a retry must not become a second text.
 *
 * Everything else — replies, clarifications, an acknowledgment on a split
 * night — can legitimately recur within a day and is counted rather than
 * suppressed.
 */
export const ONCE_PER_DAY_TYPES: ReadonlySet<string> = new Set<string>([
  "EVENING_WAKE_QUESTION",
  "MORNING_VERDICT",
]);

export function isOncePerDay(messageType: MessageType): boolean {
  return ONCE_PER_DAY_TYPES.has(messageType);
}
