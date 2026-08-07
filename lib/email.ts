import { Resend } from "resend";

// From address. Defaults to Resend's shared onboarding sender so email works
// before a custom domain is verified. Override with EMAIL_FROM once the domain
// is set up (e.g. "PRform <hi@prform.app>").
const DEFAULT_FROM = "PRform <onboarding@resend.dev>";

let resend: Resend | null = null;
function getResend(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  if (!resend) resend = new Resend(apiKey);
  return resend;
}

/**
 * Send a transactional email. Fails gracefully: if RESEND_API_KEY is missing
 * (e.g. local dev), it logs a warning and no-ops instead of throwing, so the
 * calling flow is never broken by email configuration.
 *
 * Returns true if the email was handed off to Resend, false if it was skipped
 * or errored — callers that need to stamp state should key off the return.
 */
export interface SendEmailResult {
  ok: boolean;
  /** Resend's id. Required to cancel a scheduled send; null on failure. */
  id: string | null;
  error: string | null;
}

export interface SendEmailOptions {
  /**
   * ISO 8601. Resend holds the message and delivers at that instant, which is
   * what lets the messaging layer treat email as a schedulable channel. Up to
   * 30 days ahead.
   */
  scheduledAt?: string;
}

export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  opts?: SendEmailOptions
): Promise<SendEmailResult> {
  const client = getResend();
  if (!client) {
    console.warn(
      `[email] RESEND_API_KEY not set, skipping email to ${to} ("${subject}")`
    );
    return { ok: false, id: null, error: "not_configured" };
  }

  const from = process.env.EMAIL_FROM || DEFAULT_FROM;

  try {
    const { data, error } = await client.emails.send({
      from,
      to,
      subject,
      html,
      ...(opts?.scheduledAt ? { scheduledAt: opts.scheduledAt } : {}),
    });
    if (error) {
      console.error(`[email] Resend error sending to ${to}:`, error);
      return { ok: false, id: null, error: error.message ?? "resend_error" };
    }
    return { ok: true, id: data?.id ?? null, error: null };
  } catch (e) {
    console.error(`[email] Failed to send to ${to}:`, e);
    return { ok: false, id: null, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Cancels a scheduled email that has not gone out yet.
 *
 * The STOP path depends on this the same way it depends on Twilio's cancel: an
 * athlete who opts out at 21:00 must not receive the 06:00 message already
 * sitting in Resend's queue.
 */
export async function cancelEmail(
  id: string
): Promise<{ ok: boolean; alreadyResolved: boolean; error: string | null }> {
  const client = getResend();
  if (!client) return { ok: false, alreadyResolved: true, error: "not_configured" };

  try {
    const { error } = await client.emails.cancel(id);
    if (error) {
      // A message that has already sent cannot be cancelled and never will be.
      // Reported as resolved so the caller closes the ledger row rather than
      // retrying forever.
      return { ok: false, alreadyResolved: true, error: error.message ?? "resend_error" };
    }
    return { ok: true, alreadyResolved: false, error: null };
  } catch (e) {
    return { ok: false, alreadyResolved: false, error: e instanceof Error ? e.message : String(e) };
  }
}
