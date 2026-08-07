// The messaging provider contract. Nothing outside lib/messaging/twilio.ts may
// import the Twilio SDK — everything else talks to this interface, so adding
// WhatsApp later is a new driver rather than a rewrite.
//
// The shape is deliberately narrow. Three verbs and one parser is everything
// the product needs, and every extra method is another thing a second driver
// would have to implement.
//
// ── Two interfaces, not one ─────────────────────────────────────────────────
//
// Web push arrived and did not fit. It sends, and it has no inbound at all: no
// webhook to authenticate, no reply to parse, no provider-side schedule to
// cancel. Forcing it to implement `verifySignature` and `normalizeInbound`
// would mean three methods that throw, and a driver whose type says it can do
// things it cannot is worse than no abstraction.
//
// So the contract splits at the seam that was already there:
//
//   OutboundProvider — schedule, sendNow, cancel. Exactly what sendMessage
//                      calls, and all a channel needs to carry a message.
//   MessageProvider  — the above plus the inbound half. Twilio implements it;
//                      the inbound webhook route requires it by type, so a
//                      push driver can never be wired up as one by mistake.
//
// `canSchedule` is the other half of the accommodation. Twilio holds a future
// message for us; a push service will not, so the push driver reports false
// and sendMessage keeps the message in our own ledger until it is due. The
// capability is declared rather than discovered, because discovering it means
// finding out from a failed send at 21:00.

/** E.164, e.g. "+15551234567". Enforced at the boundary, assumed within. */
export type PhoneNumber = string;

/**
 * Where a message is going, and by what road.
 *
 * A discriminated union rather than a bare string because the two channels are
 * addressed differently in kind: an SMS goes to a number the User row carries,
 * and a push goes to every live subscription belonging to an athlete — one
 * recipient, many endpoints. The caller resolves which, so no driver has to
 * guess and no driver can send on a channel that is not its own.
 */
export type Recipient =
  | { channel: "SMS"; phoneNumber: PhoneNumber }
  | { channel: "PUSH"; userId: string }
  | { channel: "EMAIL"; email: string; name: string | null };

/**
 * Per-send hints a richer channel can use and a plainer one ignores.
 *
 * A text is one string and that is the whole of it. A notification has a
 * title, somewhere to go when tapped, and a tag that decides whether a second
 * one replaces the first or stacks beneath it. Rather than fork the send path
 * per channel, the extra is optional here: Twilio drops it, push uses it, and
 * `body` stays the single source of the words either way — the copy in
 * lib/messaging/copy.ts is written to land on a lock screen, which is what
 * both channels are.
 */
export interface OutboundOptions {
  /**
   * Collapse key. Two notifications with the same tag replace each other, so a
   * re-scheduled morning message updates the one already sitting there instead
   * of leaving two contradicting each other.
   */
  tag?: string;
  /** Where tapping it goes. Defaults to the dashboard. */
  url?: string;
}

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

/**
 * A channel that can carry a message out. Everything `sendMessage` needs, and
 * nothing else — this is the interface a new channel has to satisfy.
 */
export interface OutboundProvider {
  /** Human-readable driver name, for logs. */
  readonly name: string;

  /** Which channel this driver is. A driver serves exactly one. */
  readonly channel: "SMS" | "PUSH" | "EMAIL";

  /**
   * Whether the provider will hold a future message for us.
   *
   * True for Twilio. False for web push, where no such API exists — for those
   * drivers `schedule` is never called, and sendMessage holds the message in
   * the SentMessage ledger until the flush pass finds it due.
   */
  readonly canSchedule: boolean;

  /**
   * Hands the provider a message to deliver at `sendAt`. Implementations must
   * reject a `sendAt` the provider will not accept rather than let it fail
   * silently — Twilio's window is 15 minutes to 35 days.
   *
   * Only ever called on a driver with `canSchedule: true`.
   */
  schedule(to: Recipient, body: string, sendAt: Date, opts?: OutboundOptions): Promise<SendResult>;

  /** Immediate send, for replies and for anything inside the schedule floor. */
  sendNow(to: Recipient, body: string, opts?: OutboundOptions): Promise<SendResult>;

  /**
   * Cancels a previously scheduled message. The STOP path depends on this: an
   * opt-out at 21:00 has to stop the 06:00 message that is already queued.
   *
   * A driver that cannot schedule has nothing queued anywhere but our own
   * ledger, and reports `alreadyResolved` so the caller closes the row out.
   */
  cancel(providerMessageSid: string): Promise<CancelResult>;
}

/**
 * A channel that also receives. Only SMS does, today — the inbound webhook
 * route types its provider as this, so no outbound-only driver can be handed
 * to it.
 */
export interface MessageProvider extends OutboundProvider {
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
