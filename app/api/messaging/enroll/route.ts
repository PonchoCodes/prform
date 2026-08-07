import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toE164 } from "@/lib/messaging/provider";
import { isValidTimeZone } from "@/lib/messaging/time";
import { SMS_CONSENT_TEXT, SMS_CONSENT_VERSION } from "@/lib/messaging/consent";
import {
  codeExpiry,
  generateCode,
  hashCode,
  RESEND_COOLDOWN_SECONDS,
} from "@/lib/messaging/verificationCode";
import { cancelAllScheduled, sendMessage } from "@/lib/messaging/send";
import { verificationCode as verificationCodeBody } from "@/lib/messaging/copy";
import { localDateOf } from "@/lib/messaging/time";

// Starts SMS enrolment: records the opt-in and texts a verification code.
//
// THE RULE THIS ROUTE EXISTS TO ENFORCE: the athlete being enrolled is always
// the athlete making the request. The user id comes from the session and from
// nowhere else — there is no userId, email or athlete parameter to supply, so
// there is no request a coach can construct that enrols somebody else. Most of
// these athletes are minors and coaches will arrive with rosters; the answer to
// "can you bulk-add my team" has to be no at the level of the API, not at the
// level of the UI that happens to be built today.
//
// phoneVerifiedAt stays null here. Consent is recorded, but nothing scheduled
// will send until a code sent to the number itself comes back — which is what
// stops one athlete from enrolling another's number, whatever they type in.

export const dynamic = "force-dynamic";

/** Last four digits only. The UI needs to confirm which phone, not show it. */
function maskNumber(e164: string): string {
  return `••• ••• ${e164.slice(-4)}`;
}

/** Current enrolment state, for rendering the panel. */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as { id: string }).id;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      phoneNumber: true,
      phoneVerifiedAt: true,
      ianaTimezone: true,
      smsStatus: true,
      smsOptInAt: true,
    },
  });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    maskedPhone: user.phoneNumber ? maskNumber(user.phoneNumber) : null,
    verified: user.phoneVerifiedAt !== null,
    ianaTimezone: user.ianaTimezone,
    smsStatus: user.smsStatus,
    optedInAt: user.smsOptInAt,
  });
}

/**
 * Turning texts off from the web.
 *
 * Withdrawing consent has to be at least as easy as giving it, and the athlete
 * who is out of credit or has changed phones cannot rely on being able to text
 * STOP. Uses the same cancellation path as the STOP keyword, so anything
 * already queued is pulled back rather than merely suppressed.
 */
export async function DELETE() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as { id: string }).id;

  await prisma.user.update({
    where: { id: userId },
    data: { smsStatus: "STOPPED" },
  });
  const cancelled = await cancelAllScheduled(userId);

  return NextResponse.json({ ok: true, cancelled });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as { id: string }).id;

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  // Consent has to be an affirmative act. A missing field, a string, or a
  // pre-checked default all fail this.
  if (body.consent !== true) {
    return NextResponse.json(
      { error: "You'll need to tick the consent box to turn on texts." },
      { status: 400 },
    );
  }

  const phoneNumber = typeof body.phoneNumber === "string" ? toE164(body.phoneNumber) : null;
  if (!phoneNumber) {
    return NextResponse.json(
      { error: "That doesn't look like a mobile number. Try including the area code." },
      { status: 400 },
    );
  }

  const ianaTimezone = body.ianaTimezone;
  if (!isValidTimeZone(ianaTimezone)) {
    return NextResponse.json(
      { error: "Pick a timezone from the list so we text you at the right local time." },
      { status: 400 },
    );
  }

  const now = new Date();

  // Don't let a resend button become a way to make someone's phone buzz.
  const recent = await prisma.phoneVerification.findFirst({
    where: {
      userId,
      phoneNumber,
      createdAt: { gt: new Date(now.getTime() - RESEND_COOLDOWN_SECONDS * 1000) },
    },
    select: { createdAt: true },
  });
  if (recent) {
    const wait = Math.ceil(
      (RESEND_COOLDOWN_SECONDS * 1000 - (now.getTime() - recent.createdAt.getTime())) / 1000,
    );
    return NextResponse.json(
      { error: `Give it ${wait}s before asking for another code.` },
      { status: 429 },
    );
  }

  // Recording the opt-in and clearing any previous verification in one write.
  //
  // smsStatus goes to UNVERIFIED even for someone previously STOPPED: this is
  // an authenticated, deliberate re-opt-in by the athlete themselves, which is
  // the only legitimate way back. See the note below about what still has to
  // happen at the carrier.
  try {
    await prisma.user.update({
      where: { id: userId },
      data: {
        phoneNumber,
        ianaTimezone,
        phoneVerifiedAt: null,
        smsStatus: "UNVERIFIED",
        smsOptInAt: now,
        // The server's own copy of the wording, never the client's. See
        // lib/messaging/consent.ts.
        smsOptInText: `[${SMS_CONSENT_VERSION}] ${SMS_CONSENT_TEXT}`,
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      // The unique index on phoneNumber. Two accounts on one number would make
      // every inbound message ambiguous about who sent it.
      return NextResponse.json(
        { error: "That number is already linked to another PRform account." },
        { status: 409 },
      );
    }
    throw e;
  }

  const code = generateCode();
  await prisma.phoneVerification.create({
    data: {
      userId,
      phoneNumber,
      codeHash: hashCode(code, phoneNumber),
      expiresAt: codeExpiry(now),
    },
  });

  const outcome = await sendMessage({
    userId,
    messageType: "VERIFICATION_CODE",
    body: verificationCodeBody(code),
    localDate: localDateOf(now, ianaTimezone),
    // Pinned to SMS, and this one is not a preference: the code proves control
    // of the number it is sent to. Delivered any other way it proves nothing,
    // and an athlete who had set their channel to push would be able to verify
    // a number that is not theirs.
    forceChannel: "SMS",
  });

  if (outcome.status === "blocked" || outcome.status === "failed") {
    console.error(`[messaging] verification code not sent for user=${userId}: ${outcome.reason}`);
    return NextResponse.json(
      {
        error:
          "We couldn't send the code just now. Check the number and try again in a minute.",
        reason: outcome.reason,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    phoneNumber,
    // True when nothing actually left the building, so the UI can say so rather
    // than leaving someone staring at a phone that will never buzz.
    dryRun: outcome.status === "dry_run",
  });
}
