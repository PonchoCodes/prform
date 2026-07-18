import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { reminder1Email, reminder2Email } from "@/lib/emailTemplates";

// Daily cron (see vercel.json) that nudges approved users who never connected
// Strava. Two reminders max, ever:
//   Reminder 1 — approvedAt older than 48h, reminder 1 not yet sent
//   Reminder 2 — approvedAt older than 5 days, reminder 1 sent, reminder 2 not
//
// IMPORTANT: every email send is awaited before the handler returns. Vercel
// serverless functions are killed once the response is sent, so any
// fire-and-forget promise would be dropped mid-flight.

export const dynamic = "force-dynamic";

const HOURS_48 = 48 * 60 * 60 * 1000;
const DAYS_5 = 5 * 24 * 60 * 60 * 1000;

// Lowered temporarily to test locally (e.g. set to 60 * 1000 for 1 minute).
const REMINDER_1_THRESHOLD_MS = HOURS_48;
const REMINDER_2_THRESHOLD_MS = DAYS_5;

export async function GET(req: NextRequest) {
  // Protect the endpoint. Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`.
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = Date.now();

  // Candidates: approved, not connected to Strava, and still owed a reminder.
  // "Not connected" keys off the canonical stravaConnected flag AND null tokens
  // so a partially-cleared record can't slip through.
  const candidates = await prisma.user.findMany({
    where: {
      approvedAt: { not: null },
      stravaConnected: false,
      stravaAccessToken: null,
      OR: [
        { stravaReminder1At: null },
        { stravaReminder1At: { not: null }, stravaReminder2At: null },
      ],
    },
    select: {
      id: true,
      email: true,
      name: true,
      approvedAt: true,
      stravaReminder1At: true,
      stravaReminder2At: true,
    },
  });

  let sent1 = 0;
  let sent2 = 0;

  for (const user of candidates) {
    if (!user.approvedAt) continue;
    const approvedAgo = now - user.approvedAt.getTime();

    // Reminder 1: 48h after approval, if never sent.
    if (!user.stravaReminder1At && approvedAgo >= REMINDER_1_THRESHOLD_MS) {
      const { subject, html } = reminder1Email(user.name);
      const ok = await sendEmail(user.email, subject, html);
      // Stamp regardless of send success so a hard-bouncing address never
      // gets retried into an infinite loop; skipped-because-no-key sends
      // (ok === false, no client) are the local-dev case and also stamp.
      await prisma.user.update({
        where: { id: user.id },
        data: { stravaReminder1At: new Date() },
      });
      if (ok) sent1++;
      continue;
    }

    // Reminder 2: 5 days after approval, only if reminder 1 already went out.
    if (
      user.stravaReminder1At &&
      !user.stravaReminder2At &&
      approvedAgo >= REMINDER_2_THRESHOLD_MS
    ) {
      const { subject, html } = reminder2Email(user.name);
      const ok = await sendEmail(user.email, subject, html);
      await prisma.user.update({
        where: { id: user.id },
        data: { stravaReminder2At: new Date() },
      });
      if (ok) sent2++;
    }
  }

  return NextResponse.json({
    ok: true,
    candidates: candidates.length,
    reminder1Sent: sent1,
    reminder2Sent: sent2,
  });
}
