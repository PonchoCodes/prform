// The email driver: a third channel behind the same OutboundProvider contract
// as Twilio and web push.
//
// ── Why it exists ───────────────────────────────────────────────────────────
//
// It is the only channel besides SMS that can hold a future message for us.
// Resend accepts `scheduledAt`, so an evening question queued at 03:00 for
// 20:00 is Resend's problem rather than ours, and it arrives on time whether or
// not this app is running. That is the same property that lets the messaging
// cron run once a day, and it is exactly what web push cannot do.
//
// The practical consequence: an athlete on email gets working scheduled
// messages on a Vercel Hobby plan, with no five-minute flush trigger and no
// upgrade. See COSTS.md.
//
// ── Being honest about the channel ──────────────────────────────────────────
//
// Email is the weakest of the three for the evening message. A text and a push
// land on a lock screen a teenager already looks at; an email lands in an inbox
// many of them check weekly. It is the right default for nobody and the right
// fallback for plenty: an athlete who will not install a PWA and will not give
// a phone number is otherwise unreachable, and unreachable is worse than slow.
//
// ── One message, not a newsletter ───────────────────────────────────────────
//
// The body is the same single sentence the other channels send, wrapped in the
// least email-shaped HTML that will render: no header image, no columns, no
// footer of social links. The copy in lib/messaging/copy.ts is written to be
// read on a lock screen in two seconds, and dressing it up as a campaign would
// undo that and land it in Promotions.

import { sendEmail } from "@/lib/email";
import { appBaseUrl } from "@/lib/emailTemplates";
import type {
  CancelResult,
  OutboundOptions,
  OutboundProvider,
  Recipient,
  SendResult,
} from "@/lib/messaging/provider";

/**
 * Resend's ceiling on how far ahead a message may be scheduled. Well past the
 * ~30 hours the daily cron ever needs.
 */
export const EMAIL_SCHEDULE_CEILING_DAYS = 30;

/** Escapes text for interpolation into the HTML body. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * The subject line.
 *
 * Derived from the message rather than fixed, because a mailbox shows the
 * subject and little else, and "PRform" repeated twice a day is indistinguishable
 * from a mailing list. The first clause of the body is the message.
 */
function subjectFor(body: string): string {
  const firstSentence = body.split(/(?<=[.?!])\s/)[0] ?? body;
  return firstSentence.length <= 78 ? firstSentence : `${firstSentence.slice(0, 75)}…`;
}

function htmlFor(body: string, url: string): string {
  const safe = escapeHtml(body);
  const href = escapeHtml(url);
  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0A0A0A;">
  <div style="max-width:420px;margin:0 auto;">
    <p style="font-weight:900;font-size:16px;text-transform:uppercase;letter-spacing:-0.02em;margin:0 0 24px;">PR<span style="background:#0A0A0A;color:#E8FF00;padding:0 4px;">form</span></p>
    <p style="font-size:17px;line-height:1.5;margin:0 0 24px;">${safe}</p>
    <p style="margin:0 0 32px;"><a href="${href}" style="display:inline-block;background:#0A0A0A;color:#ffffff;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;text-decoration:none;padding:12px 20px;">Open PRform</a></p>
    <p style="font-size:11px;color:#6B6B6B;margin:0;">You're getting this because you turned on PRform reminders. Change that any time in your profile.</p>
  </div>
</body></html>`;
}

export class EmailProvider implements OutboundProvider {
  readonly name = "resend";
  readonly channel = "EMAIL" as const;
  /** Resend holds a future message, so the flush pass is not needed here. */
  readonly canSchedule = true;

  async schedule(
    to: Recipient,
    body: string,
    sendAt: Date,
    opts?: OutboundOptions,
  ): Promise<SendResult> {
    return this.deliver(to, body, opts, sendAt);
  }

  async sendNow(to: Recipient, body: string, opts?: OutboundOptions): Promise<SendResult> {
    return this.deliver(to, body, opts);
  }

  private async deliver(
    to: Recipient,
    body: string,
    opts?: OutboundOptions,
    sendAt?: Date,
  ): Promise<SendResult> {
    if (to.channel !== "EMAIL") {
      return {
        ok: false,
        providerMessageSid: null,
        providerStatus: null,
        error: `email driver was handed a ${to.channel} recipient`,
      };
    }

    if (sendAt) {
      const daysAhead = (sendAt.getTime() - Date.now()) / 86_400_000;
      if (daysAhead > EMAIL_SCHEDULE_CEILING_DAYS) {
        return {
          ok: false,
          providerMessageSid: null,
          providerStatus: null,
          error: "send_at_beyond_schedule_ceiling",
        };
      }
    }

    const url = `${appBaseUrl()}${opts?.url ?? "/dashboard"}`;
    const result = await sendEmail(
      to.email,
      subjectFor(body),
      htmlFor(body, url),
      // ISO 8601. Resend holds it and delivers at that instant.
      sendAt ? { scheduledAt: sendAt.toISOString() } : undefined,
    );

    if (!result.ok) {
      return {
        ok: false,
        providerMessageSid: null,
        providerStatus: null,
        error: result.error ?? "email_send_failed",
      };
    }

    return {
      ok: true,
      // Resend's id, which is what makes a scheduled email cancellable.
      providerMessageSid: result.id,
      providerStatus: sendAt ? "scheduled" : "sent",
      error: null,
    };
  }

  async cancel(providerMessageSid: string): Promise<CancelResult> {
    const { cancelEmail } = await import("@/lib/email");
    return cancelEmail(providerMessageSid);
  }
}

let cached: EmailProvider | null = null;

/**
 * The email driver, or null when Resend is not configured. Null is normal
 * locally, and callers treat it exactly as they treat absent Twilio
 * credentials: no provider, no send, no throw.
 */
export function getEmailProvider(): OutboundProvider | null {
  if (!process.env.RESEND_API_KEY) return null;
  if (!cached) cached = new EmailProvider();
  return cached;
}
