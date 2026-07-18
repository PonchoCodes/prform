import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { approvedWaitlistCount, EARLY_ACCESS_APPROVAL_CAP } from "@/lib/earlyAccess";
import { sendEmail } from "@/lib/email";
import { approvalEmail } from "@/lib/emailTemplates";

async function requireAdmin(): Promise<NextResponse | null> {
  const session = await getServerSession(authOptions);
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail || session?.user?.email !== adminEmail) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

export async function GET() {
  const forbidden = await requireAdmin();
  if (forbidden) return forbidden;

  const [entries, approvedCount] = await Promise.all([
    prisma.waitlist.findMany({ orderBy: { createdAt: "asc" } }),
    approvedWaitlistCount(),
  ]);

  // Join per-user Strava connection + reminder status onto each waitlist entry
  // so the admin UI can surface who still hasn't connected. Keyed by email.
  const users = await prisma.user.findMany({
    where: { email: { in: entries.map((e) => e.email) } },
    select: {
      email: true,
      approvedAt: true,
      stravaConnected: true,
      stravaReminder1At: true,
      stravaReminder2At: true,
    },
  });
  const byEmail = new Map(users.map((u) => [u.email, u]));

  const enriched = entries.map((e) => {
    const u = byEmail.get(e.email);
    return {
      ...e,
      hasAccount: Boolean(u),
      userApprovedAt: u?.approvedAt ?? null,
      stravaConnected: u?.stravaConnected ?? false,
      remindersSent:
        (u?.stravaReminder1At ? 1 : 0) + (u?.stravaReminder2At ? 1 : 0),
    };
  });

  return NextResponse.json({
    entries: enriched,
    approvedCount,
    cap: EARLY_ACCESS_APPROVAL_CAP,
  });
}

export async function POST(req: Request) {
  const forbidden = await requireAdmin();
  if (forbidden) return forbidden;

  const { id, action } = await req.json();
  if (!id || (action !== "approve" && action !== "reject")) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const entry = await prisma.waitlist.findUnique({ where: { id } });
  if (!entry) {
    return NextResponse.json({ error: "Entry not found" }, { status: 404 });
  }

  if (action === "reject") {
    await prisma.waitlist.update({
      where: { id },
      data: { status: "REJECTED" },
    });
    return NextResponse.json({ ok: true });
  }

  if (entry.status === "APPROVED") {
    return NextResponse.json({ ok: true });
  }

  const approvedCount = await approvedWaitlistCount();
  if (approvedCount >= EARLY_ACCESS_APPROVAL_CAP) {
    return NextResponse.json(
      { error: `Approval cap reached (${EARLY_ACCESS_APPROVAL_CAP} approved).` },
      { status: 409 }
    );
  }

  // Grandfathering happens here: earlyAccessUser is set at the moment of
  // approval and is what exempts the user from Stripe permanently. If the
  // user hasn't registered yet, the register route applies the same flags
  // (including approvedAt) when they sign up with an APPROVED waitlist email.
  const approvedAt = new Date();
  await prisma.$transaction([
    prisma.waitlist.update({
      where: { id },
      data: { status: "APPROVED", approvedAt },
    }),
    prisma.user.updateMany({
      where: { email: entry.email },
      // approvedAt starts the reminder-cron clock. Set once — the early
      // return above prevents an already-APPROVED entry from reaching here.
      data: { approved: true, earlyAccessUser: true, approvedAt },
    }),
  ]);

  // Send the approval email with the Strava OAuth deep link. Awaited so it
  // completes before the response returns (serverless kills pending work).
  const { subject, html } = approvalEmail(entry.name);
  await sendEmail(entry.email, subject, html);

  return NextResponse.json({ ok: true });
}
