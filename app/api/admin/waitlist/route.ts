import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { approvedWaitlistCount, EARLY_ACCESS_APPROVAL_CAP } from "@/lib/earlyAccess";

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

  return NextResponse.json({
    entries,
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
      { error: `Approval cap reached (${EARLY_ACCESS_APPROVAL_CAP}). Strava Standard tier allows 10 connected athletes.` },
      { status: 409 }
    );
  }

  // Grandfathering happens here: earlyAccessUser is set at the moment of
  // approval and is what exempts the user from Stripe permanently. If the
  // user hasn't registered yet, the register route applies the same flags
  // when they sign up with an APPROVED waitlist email.
  await prisma.$transaction([
    prisma.waitlist.update({
      where: { id },
      data: { status: "APPROVED", approvedAt: new Date() },
    }),
    prisma.user.updateMany({
      where: { email: entry.email },
      data: { approved: true, earlyAccessUser: true },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
