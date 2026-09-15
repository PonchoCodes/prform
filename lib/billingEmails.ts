// The renewal notice, in two sendings, three weeks and one week before the
// charge lands.
//
// It exists for two reasons and they point the same way. California and
// several other states require advance notice of an automatic renewal that
// states the amount and the date. And a coach who is reminded in early July
// that their season tool renews on the 31st renews it; a coach who finds a
// $149 line on a school card in August disputes it and leaves.
//
// So the email says the number, the date, what it buys and how to stop it, in
// that order, in the first two lines. Nothing is collapsed, nothing is a link
// to terms, and there is no offer in it.
//
// Separate from lib/emailTemplates.ts on purpose: that file's layout appends a
// Strava OAuth link to every message it builds, which has no business in a
// billing notice.

import { formatRenewalDate, formatUsd } from "@/lib/teamBilling";

const ACCENT = "#E8FF00";
const INK = "#0A0A0A";
const GRAY = "#6B6B6B";

function layout(bodyHtml: string): string {
  return `
  <div style="background:#ffffff;padding:0;margin:0;font-family:Arial,Helvetica,sans-serif;color:${INK};">
    <div style="max-width:520px;margin:0 auto;padding:40px 32px;">
      <div style="font-size:22px;font-weight:900;letter-spacing:-0.02em;text-transform:uppercase;margin-bottom:32px;">
        PR<span style="background:${INK};color:${ACCENT};padding:0 4px;">form</span>
      </div>
      ${bodyHtml}
      <hr style="border:none;border-top:1px solid #E5E5E5;margin:32px 0 16px;">
      <p style="font-size:11px;color:${GRAY};letter-spacing:0.1em;text-transform:uppercase;">
        PRform · Sleep optimization for competitive runners
      </p>
    </div>
  </div>`;
}

function heading(text: string): string {
  return `<h1 style="font-size:24px;font-weight:900;text-transform:uppercase;letter-spacing:-0.01em;margin:0 0 16px;">${text}</h1>`;
}

function para(text: string): string {
  return `<p style="font-size:15px;line-height:1.6;color:${INK};margin:0 0 16px;">${text}</p>`;
}

export interface RenewalNoticeArgs {
  teamName: string;
  amountCents: number;
  renewalDate: Date;
  seatLimit: number;
  /** How to reach the page that cancels. Absolute. */
  manageUrl: string;
}

export function renewalNoticeEmail(args: RenewalNoticeArgs): { subject: string; html: string } {
  const amount = formatUsd(args.amountCents);
  const date = formatRenewalDate(args.renewalDate);

  const html = layout(
    heading("Your PRform renewal") +
      para(
        `<strong>${args.teamName}</strong> renews on <strong>${date}</strong>, and the card on file will be charged <strong>${amount}</strong> on that date.`
      ) +
      para(
        `That covers a full year: your roster of up to ${args.seatLimit} athletes, the readiness view, trends, meet reports and export.`
      ) +
      para(
        `It renews automatically every year until you cancel. To cancel, open your team settings at <a href="${args.manageUrl}" style="color:${INK};">${args.manageUrl}</a>, or reply to this email and we will do it for you. Cancel before ${date} and you are not charged.`
      ) +
      para(
        `If you cancel, nothing happens to your athletes. They keep their accounts, their sleep history and their own plans. The team keeps its roster; it loses the coach-side features.`
      )
  );

  return {
    subject: `${args.teamName} renews ${date} for ${amount}`,
    html,
  };
}
