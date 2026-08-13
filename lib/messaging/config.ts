// Every switch that can stop a message leaving the building, read in one place.
//
// The defaults are chosen so that a missing or misspelled environment variable
// fails toward silence. Sending a text to a real teenager because a var didn't
// get set in a new environment is not a recoverable mistake — the message has
// already arrived.

function envFlag(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return defaultValue;
  return !["false", "0", "no", "off"].includes(raw.trim().toLowerCase());
}

function envInt(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return defaultValue;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : defaultValue;
}

/**
 * Log the recipient and the exact body; hand nothing to a provider.
 *
 * Defaults to ON. Real sending has to be switched on deliberately, in one
 * place, by someone who meant it — the opposite default would make "forgot to
 * configure the environment" and "start texting people" the same event.
 */
export function isDryRun(): boolean {
  return envFlag("SMS_DRY_RUN", true);
}

/**
 * The global brake. When set, nothing goes out at all — not replies, not
 * verification codes, not the mandatory auto-replies.
 *
 * STOP and HELP compliance survives this, because Twilio's Advanced Opt-Out
 * answers both at the Messaging Service level, provider-side, without reaching
 * our code. That is the backstop that makes an absolute kill switch safe.
 */
export function isKillSwitchOn(): boolean {
  return envFlag("SMS_KILL_SWITCH", false);
}

/**
 * The global brake for email, separate from the SMS and push ones.
 *
 * Three flags rather than one because they exist to be reached for in a hurry,
 * and a flag that stops three channels when you meant to stop one is a flag
 * nobody trusts at 2am.
 */
export function isEmailKillSwitchOn(): boolean {
  return envFlag("EMAIL_KILL_SWITCH", false);
}

/**
 * Hard ceiling on messages to one athlete in one of their local days, counted
 * in code from the SentMessage ledger rather than inferred from the schedule.
 * The schedule is a plan; the ledger is what happened.
 *
 * Two scheduled messages plus a reply to each, plus headroom for one
 * clarification, is five. A sixth in a day means a loop.
 */
export function dailySendCap(): number {
  return envInt("SMS_MAX_PER_USER_PER_DAY", 5);
}

/**
 * How long before lights-out the evening check-in goes out.
 *
 * Lives here rather than in the cron route that schedules with it because the
 * install prompt quotes this time back to the athlete ("install PRform to get
 * reminded at 9:17 PM"), and a promise made on the dashboard that the scheduler
 * does not keep is worse than making no promise at all.
 */
export const EVENING_LEAD_MINUTES = 90;

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  messagingServiceSid: string;
}

/**
 * Twilio credentials, or null when they are not all present. Null is a normal
 * state in local development and under DRY_RUN; callers must treat it as "no
 * provider" rather than throwing on import.
 */
export function twilioConfig(): TwilioConfig | null {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  // Message scheduling requires a Messaging Service; a bare "from" number
  // cannot schedule, so this is not optional for our use.
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
  if (!accountSid || !authToken || !messagingServiceSid) return null;
  return { accountSid, authToken, messagingServiceSid };
}

/**
 * Public URL the provider posts webhooks to. Signature verification hashes the
 * exact URL the provider signed, so this must match it byte for byte —
 * including scheme and any trailing path — or every inbound is rejected.
 */
export function inboundWebhookUrl(): string | null {
  return process.env.TWILIO_INBOUND_WEBHOOK_URL || null;
}
