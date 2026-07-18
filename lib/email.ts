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
export async function sendEmail(
  to: string,
  subject: string,
  html: string
): Promise<boolean> {
  const client = getResend();
  if (!client) {
    console.warn(
      `[email] RESEND_API_KEY not set — skipping email to ${to} ("${subject}")`
    );
    return false;
  }

  const from = process.env.EMAIL_FROM || DEFAULT_FROM;

  try {
    const { error } = await client.emails.send({ from, to, subject, html });
    if (error) {
      console.error(`[email] Resend error sending to ${to}:`, error);
      return false;
    }
    return true;
  } catch (e) {
    console.error(`[email] Failed to send to ${to}:`, e);
    return false;
  }
}
