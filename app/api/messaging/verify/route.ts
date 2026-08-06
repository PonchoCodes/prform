import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { codeMatches, MAX_ATTEMPTS } from "@/lib/messaging/verificationCode";

// Confirms a verification code and, only then, turns messaging on.
//
// This is the single place `phoneVerifiedAt` is ever set. Everything upstream
// records intent; this records proof that the person holding the phone is the
// person who asked for the texts.

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as { id: string }).id;

  const body = await req.json().catch(() => null);
  const submitted = typeof body?.code === "string" ? body.code.replace(/\D/g, "") : "";
  if (submitted.length === 0) {
    return NextResponse.json({ error: "Enter the code we texted you." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { phoneNumber: true, smsOptInAt: true },
  });
  if (!user?.phoneNumber) {
    return NextResponse.json({ error: "Add a phone number first." }, { status: 400 });
  }

  const now = new Date();

  // The most recent live code for the number currently on the account. Scoping
  // to the number matters: if someone changes it between requesting and
  // confirming, the old code must not verify the new one.
  const verification = await prisma.phoneVerification.findFirst({
    where: {
      userId,
      phoneNumber: user.phoneNumber,
      consumedAt: null,
      expiresAt: { gt: now },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!verification) {
    return NextResponse.json(
      { error: "That code has expired. Ask for a new one." },
      { status: 400 },
    );
  }

  if (verification.attempts >= MAX_ATTEMPTS) {
    return NextResponse.json(
      { error: "Too many tries. Ask for a new code." },
      { status: 429 },
    );
  }

  if (!codeMatches(submitted, verification.codeHash, user.phoneNumber)) {
    // Counted before the response goes out, so a client that ignores the reply
    // and hammers the endpoint still burns its five attempts.
    const updated = await prisma.phoneVerification.update({
      where: { id: verification.id },
      data: { attempts: { increment: 1 } },
      select: { attempts: true },
    });
    const left = Math.max(0, MAX_ATTEMPTS - updated.attempts);
    return NextResponse.json(
      {
        error: left > 0 ? `That code didn't match. ${left} tries left.` : "Too many tries. Ask for a new code.",
      },
      { status: 400 },
    );
  }

  // Consume the code and flip the account on together, so a crash between the
  // two cannot leave a spent code that still verifies.
  await prisma.$transaction([
    prisma.phoneVerification.update({
      where: { id: verification.id },
      data: { consumedAt: now },
    }),
    prisma.user.update({
      where: { id: userId },
      data: { phoneVerifiedAt: now, smsStatus: "ACTIVE" },
    }),
  ]);

  return NextResponse.json({ ok: true, phoneNumber: user.phoneNumber });
}
