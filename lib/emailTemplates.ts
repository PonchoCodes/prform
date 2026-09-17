// Email templates for the Strava connection follow-up system.
//
// All emails drive the recipient to the same OAuth deep link: /login with a
// callbackUrl of /api/strava/connect, so that after logging in the user lands
// straight in the Strava OAuth flow instead of on the dashboard.
//
// Styling is inlined (email clients strip <style>/external CSS) and mirrors the
// PRform design system: sharp corners, no shadows, #E8FF00 accent on #0A0A0A,
// uppercase bold labels.

const ACCENT = "#E8FF00";
const INK = "#0A0A0A";
const GRAY = "#6B6B6B";

/** Absolute base URL for links in emails (no trailing slash). */
export function appBaseUrl(): string {
  const raw =
    process.env.NEXTAUTH_URL_PRODUCTION ||
    process.env.NEXTAUTH_URL ||
    "https://prformm.vercel.app";
  return raw.replace(/\/$/, "");
}

/** The OAuth deep link — login, then straight into Strava connect. */
export function stravaDeepLink(): string {
  return `${appBaseUrl()}/login?callbackUrl=${encodeURIComponent("/api/strava/connect")}`;
}

function ctaButton(href: string, label: string): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0;">
      <tr>
        <td style="background:${INK};">
          <a href="${href}" style="display:inline-block;padding:16px 32px;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:bold;letter-spacing:0.15em;text-transform:uppercase;color:${ACCENT};text-decoration:none;">
            ${label}
          </a>
        </td>
      </tr>
    </table>`;
}

function layout(bodyHtml: string): string {
  const href = stravaDeepLink();
  return `
  <div style="background:#ffffff;padding:0;margin:0;font-family:Arial,Helvetica,sans-serif;color:${INK};">
    <div style="max-width:520px;margin:0 auto;padding:40px 32px;">
      <div style="font-size:22px;font-weight:900;letter-spacing:-0.02em;text-transform:uppercase;margin-bottom:32px;">
        PR<span style="background:${INK};color:${ACCENT};padding:0 4px;">form</span>
      </div>
      ${bodyHtml}
      <p style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:${GRAY};margin-top:8px;line-height:1.6;">
        Or paste this link into your browser:<br>
        <a href="${href}" style="color:${GRAY};">${href}</a>
      </p>
      <hr style="border:none;border-top:1px solid #E5E5E5;margin:32px 0 16px;">
      <p style="font-size:11px;color:${GRAY};letter-spacing:0.1em;text-transform:uppercase;">
        PRform · Sleep optimization for competitive runners
      </p>
    </div>
  </div>`;
}

export function heading(text: string): string {
  return `<h1 style="font-size:26px;font-weight:900;text-transform:uppercase;letter-spacing:-0.01em;margin:0 0 16px;color:${INK};">${text}</h1>`;
}

export function para(text: string): string {
  return `<p style="font-size:15px;line-height:1.6;color:${INK};margin:0 0 16px;">${text}</p>`;
}

/** A section label, the email's version of the dashboard's eyebrow. */
export function sectionLabel(text: string): string {
  return `<p style="font-size:11px;font-weight:700;letter-spacing:0.3em;text-transform:uppercase;color:${GRAY};margin:28px 0 8px;">${text}</p>`;
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * The frame without the Strava deep link: wordmark, body, one button, the
 * footer line. For emails that are about something other than connecting
 * Strava — the coach digest is the first.
 */
export function emailFrame(bodyHtml: string, cta?: { href: string; label: string }): string {
  return `
  <div style="background:#ffffff;padding:0;margin:0;font-family:Arial,Helvetica,sans-serif;color:${INK};">
    <div style="max-width:520px;margin:0 auto;padding:40px 32px;">
      <div style="font-size:22px;font-weight:900;letter-spacing:-0.02em;text-transform:uppercase;margin-bottom:32px;">
        PR<span style="background:${INK};color:${ACCENT};padding:0 4px;">form</span>
      </div>
      ${bodyHtml}
      ${cta ? ctaButton(cta.href, cta.label) : ""}
      <hr style="border:none;border-top:1px solid #E5E5E5;margin:32px 0 16px;">
      <p style="font-size:11px;color:${GRAY};letter-spacing:0.1em;text-transform:uppercase;">
        PRform · Sleep optimization for competitive runners
      </p>
    </div>
  </div>`;
}

const CTA_LABEL = "Connect Strava";

// The approval email is gone with the approval flow. Nobody is approved for
// anything: an account works the moment it is created.

export function reminder1Email(name?: string | null): { subject: string; html: string } {
  const href = stravaDeepLink();
  const greeting = name ? `${name}, your` : "Your";
  const html = layout(
    heading("Your spot is reserved") +
      para(`${greeting} PRform spot is reserved, but your plan is generic until Strava is connected.`) +
      para(
        `PRform reads your training load from Strava to move your bedtime earlier on hard days and around race week. Until it's connected, you're getting a one-size-fits-all schedule.`
      ) +
      ctaButton(href, CTA_LABEL)
  );
  return { subject: "Your plan is generic until you connect Strava", html };
}

export function reminder2Email(name?: string | null): { subject: string; html: string } {
  const href = stravaDeepLink();
  const greeting = name ? `${name}: ` : "";
  const html = layout(
    heading("Last note") +
      para(`${greeting}spots are capped at 10 athletes, and unconnected spots may be released to make room.`) +
      para(
        `If you still want yours, connect Strava now and your training load starts shaping tonight's plan. This is the last reminder we'll send.`
      ) +
      ctaButton(href, CTA_LABEL)
  );
  return { subject: "Last note: connect Strava to keep your spot", html };
}
