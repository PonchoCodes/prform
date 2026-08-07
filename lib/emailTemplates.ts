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

function heading(text: string): string {
  return `<h1 style="font-size:26px;font-weight:900;text-transform:uppercase;letter-spacing:-0.01em;margin:0 0 16px;color:${INK};">${text}</h1>`;
}

function para(text: string): string {
  return `<p style="font-size:15px;line-height:1.6;color:${INK};margin:0 0 16px;">${text}</p>`;
}

const CTA_LABEL = "Connect Strava";

export function approvalEmail(name?: string | null): { subject: string; html: string } {
  const href = stravaDeepLink();
  const greeting = name ? `${name}, you` : "You";
  const html = layout(
    heading("You're in") +
      para(`${greeting}'re approved for PRform early access.`) +
      para(
        `Connect Strava so your training load drives your sleep plan tonight. Without it your plan stays generic. With it, every hard session shifts your bedtime automatically.`
      ) +
      ctaButton(href, CTA_LABEL)
  );
  return { subject: "You're in. Connect Strava to start", html };
}

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
