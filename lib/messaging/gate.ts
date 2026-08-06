// Whether a given message is allowed to leave the building, decided as a pure
// function so every combination can be tested without a database or a network.
//
// The rails are ordered by severity, and the order is the contract: the reason
// reported is the most serious one that applies, so a log line reading
// "not_verified" can never be masking "stopped".

import type { MessageType } from "@prisma/client";

export type BlockReason =
  /** The global brake is on. Nothing goes out. */
  | "kill_switch"
  /** No number on file — there is nowhere to send. */
  | "no_phone_number"
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
}): GateDecision {
  const { subject, messageType, sentToday, cap, killSwitch } = input;

  if (killSwitch) return { allowed: false, reason: "kill_switch" };

  if (!subject.phoneNumber) return { allowed: false, reason: "no_phone_number" };
  if (!subject.ianaTimezone) return { allowed: false, reason: "no_timezone" };

  // Checked before verification so that someone who opted out and whose record
  // was later reset cannot be texted on the strength of the weaker check.
  if (subject.smsStatus === "STOPPED") return { allowed: false, reason: "stopped" };

  if (!BYPASSES_VERIFICATION.has(messageType)) {
    // Both conditions, deliberately. They should always agree; if they ever
    // disagree the safe reading is that this athlete is not confirmed.
    if (subject.phoneVerifiedAt === null) return { allowed: false, reason: "not_verified" };
    if (subject.smsStatus !== "ACTIVE") return { allowed: false, reason: "not_verified" };
  }

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
