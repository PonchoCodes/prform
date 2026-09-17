// The Monday digest as an email: the same sections buildDigest produced,
// in the house frame, with the plain text alongside for clients that strip
// HTML and for anyone reading the DIGEST_DRY_RUN log.
//
// Nothing is derived here. Every string comes from lib/team/digest.ts,
// which is where the coach copy guard is applied; this file escapes and
// arranges.

import { appBaseUrl, emailFrame, escapeHtml, heading, sectionLabel } from "@/lib/emailTemplates";
import type { Digest } from "@/lib/team/digest";

const INK = "#0A0A0A";
const GRAY = "#6B6B6B";

function line(text: string): string {
  return `<p style="font-size:14px;line-height:1.6;color:${INK};margin:0 0 10px;padding-left:12px;border-left:2px solid #E5E5E5;">${escapeHtml(text)}</p>`;
}

export function renderDigestEmail(digest: Digest, teamId: string): { subject: string; html: string; text: string } {
  const body =
    heading(escapeHtml(digest.headline)) +
    digest.sections
      .map((s) => sectionLabel(escapeHtml(s.title)) + s.lines.map(line).join(""))
      .join("") +
    `<p style="font-size:11px;color:${GRAY};margin-top:28px;">Turn the Monday digest off from the team page.</p>`;

  return {
    subject: digest.subject,
    html: emailFrame(body, { href: `${appBaseUrl()}/team?team=${encodeURIComponent(teamId)}`, label: "Open the dashboard" }),
    text: `${digest.headline}\n\n${digest.text}\n\nOpen the dashboard: ${appBaseUrl()}/team`,
  };
}
