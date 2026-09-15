import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { renewalNoticeEmail } from "@/lib/billingEmails";
import { appBaseUrl } from "@/lib/emailTemplates";
import { formatRenewalDate, renewalQuoteCents } from "@/lib/teamBilling";
import { resolveEntitlement } from "@/lib/entitlements";

// Advance notice of the automatic renewal, on July 1 and again on July 24.
//
// It runs daily and does nothing on 363 of those days. A cron that fires only
// in July is a cron nobody finds out is broken until July: this one executes
// its full query every morning and exercises the date check, so the failure
// mode is a log line in March rather than a silent no-send in summer.
//
// Written now, a year before it can matter. The renewal it protects is the one
// nobody remembers agreeing to, and the notice has to already exist by then.

export const dynamic = "force-dynamic";

/** The two send days, as [month index, day of month] in UTC. */
const NOTICE_DAYS: [number, number][] = [
  [6, 1],
  [6, 24],
];

function isNoticeDay(now: Date): boolean {
  return NOTICE_DAYS.some(([month, day]) => now.getUTCMonth() === month && now.getUTCDate() === day);
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  // `force` exists so the send path can be exercised on demand rather than
  // once a year in production with no way to check it beforehand.
  const forced = new URL(req.url).searchParams.get("force") === "1";

  if (!isNoticeDay(now) && !forced) {
    return NextResponse.json({ skipped: "not_a_notice_day", date: now.toISOString() });
  }

  // Every team with a live entitlement that will be charged. A FREE team has
  // nothing to be told about, and a lapsed one is not being charged.
  const teams = await prisma.team.findMany({
    where: { entitlementSource: { in: ["PILOT", "PAID"] } },
    select: {
      id: true,
      name: true,
      entitlementSource: true,
      entitlementExpiresAt: true,
      seatLimit: true,
      subscriptionStatus: true,
      stripeSubscriptionId: true,
      owner: { select: { email: true } },
    },
  });

  const baseUrl = appBaseUrl();
  let sent = 0;
  let skipped = 0;

  for (const team of teams) {
    const entitlement = resolveEntitlement(team, now);
    // Nothing is charged to a team whose plan has already lapsed, and a pilot
    // that never got a card on file has nothing to renew.
    if (!entitlement.active || !team.stripeSubscriptionId) {
      skipped++;
      continue;
    }

    // The renewal date is July 31 of whichever year is next. A pilot's first
    // charge is its expiry date; a paid team is anchored to the same day.
    const renewalYear = now.getUTCMonth() > 6 ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
    const renewalDate =
      team.entitlementSource === "PILOT" && team.entitlementExpiresAt
        ? team.entitlementExpiresAt
        : new Date(Date.UTC(renewalYear, 6, 31, 23, 59, 59));

    // The amount comes from TIERS through the resolved entitlement, the same
    // place the checkout page and the disclosure read it. `active` was checked
    // above, so the source here is PILOT or PAID and never FREE.
    const amountCents = renewalQuoteCents({
      source: entitlement.source as "PILOT" | "PAID",
      seatLimit: entitlement.seatLimit,
    });

    const { subject, html } = renewalNoticeEmail({
      teamName: team.name,
      amountCents,
      renewalDate,
      seatLimit: entitlement.seatLimit,
      manageUrl: `${baseUrl}/team/billing?team=${team.id}`,
    });

    // Awaited. Vercel kills the function the moment the response returns, so a
    // fire-and-forget send is a notice nobody receives.
    const result = await sendEmail(team.owner.email, subject, html);
    if (result.ok) sent++;
    else skipped++;
  }

  return NextResponse.json({
    ran: formatRenewalDate(now),
    teams: teams.length,
    sent,
    skipped,
  });
}
