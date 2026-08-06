// The messaging provider contract. Nothing outside lib/messaging/twilio.ts may
// import the Twilio SDK — everything else talks to this interface, so adding
// WhatsApp later is a new driver rather than a rewrite.
//
// The shape is deliberately narrow. Three verbs and one parser is everything
// the product needs, and every extra method is another thing a second driver
// would have to implement.

/** E.164, e.g. "+15551234567". Enforced at the boundary, assumed within. */
export type PhoneNumber = string;

export interface SendResult {
  ok: boolean;
  /** Provider identifier for the message. Required to cancel a scheduled send. */
  providerMessageSid: string | null;
  /** Provider-reported status, passed through unnormalized for the log. */
  providerStatus: string | null;
  /** Present when ok is false. Safe to log; never shown to an athlete. */
  error: string | null;
}

export interface CancelResult {
  ok: boolean;
  /**
   * True when the provider reports nothing to cancel — already sent, already
   * canceled, or unknown SID. Distinguished from a failure because the caller
   * wants to mark the row canceled either way rather than retry forever.
   */
  alreadyResolved: boolean;
  error: string | null;
}

/**
 * A provider webhook, reduced to the fields the app reasons about. Anything a
 * driver cannot supply is null rather than invented.
 */
export interface NormalizedInbound {
  from: PhoneNumber;
  to: PhoneNumber;
  /** Exactly as received. Never trimmed or case-folded here. */
  body: string;
  providerMessageSid: string | null;
  /**
   * When we received it. Providers report their own timestamps, but this is our
   * receipt time — it becomes SleepLog.sleepOnsetAt for a BED reply, and an
   * onset time must be one clock we control rather than one we are told.
   */
  receivedAt: Date;
}

export interface MessageProvider {
  /** Human-readable driver name, for logs. */
  readonly name: string;

  /**
   * Hands the provider a message to deliver at `sendAt`. Implementations must
   * reject a `sendAt` the provider will not accept rather than let it fail
   * silently — Twilio's window is 15 minutes to 35 days.
   */
  schedule(to: PhoneNumber, body: string, sendAt: Date): Promise<SendResult>;

  /** Immediate send, for replies and for anything inside the schedule floor. */
  sendNow(to: PhoneNumber, body: string): Promise<SendResult>;

  /**
   * Cancels a previously scheduled message. The STOP path depends on this: an
   * opt-out at 21:00 has to stop the 06:00 message that is already queued.
   */
  cancel(providerMessageSid: string): Promise<CancelResult>;

  /**
   * Verifies the request actually came from the provider. Returning false must
   * mean the request is rejected — an unauthenticated inbound endpoint lets
   * anyone write sleep onset times into another athlete's record.
   */
  verifySignature(input: {
    url: string;
    signature: string | null;
    params: Record<string, string>;
    rawBody: string;
  }): boolean;

  /** Reduces a verified webhook payload to the normalized shape. */
  normalizeInbound(params: Record<string, string>, receivedAt: Date): NormalizedInbound | null;
}

/** How long before `sendAt` a provider will still accept a scheduled message. */
export const SCHEDULE_FLOOR_MINUTES = 15;
/** The far end of the same window. */
export const SCHEDULE_CEILING_DAYS = 35;

/**
 * Whether `sendAt` sits inside the provider's schedulable window. Callers use
 * this to decide between scheduling, sending immediately, and skipping —
 * rather than discovering the answer from a rejected API call.
 */
export function scheduleWindowFor(sendAt: Date, now: Date): "too_soon" | "ok" | "too_far" {
  const deltaMs = sendAt.getTime() - now.getTime();
  if (deltaMs < SCHEDULE_FLOOR_MINUTES * 60_000) return "too_soon";
  if (deltaMs > SCHEDULE_CEILING_DAYS * 24 * 60 * 60_000) return "too_far";
  return "ok";
}

/**
 * Normalizes a phone number to E.164, or null if it plainly isn't one.
 *
 * Deliberately strict and deliberately not a full libphonenumber: the only
 * numbers that reach here come from an onboarding field we control, and a
 * number that survives a loose parse but is wrong routes an athlete's sleep
 * data to a stranger. A rejected number is a form error; a mis-parsed one is a
 * privacy incident.
 */
export function toE164(input: string, defaultCountryCode = "1"): string | null {
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;

  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 0) return null;

  if (hasPlus) {
    // 8–15 digits covers every assigned country code plus subscriber number.
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  }
  // No country code given: accept a bare national number only for the default
  // country, where the length is unambiguous.
  if (defaultCountryCode === "1") {
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
    return null;
  }
  return null;
}
