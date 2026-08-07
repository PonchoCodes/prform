import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isSmsReady, resolveChannel } from "@/lib/messaging/channel";
import { getPushProvider } from "@/lib/messaging/push";
import { getEmailProvider } from "@/lib/messaging/email";

// Which road the athlete's scheduled messages take, read and set by the owner
// of the account and nobody else.
//
// It lives here rather than on /api/user/profile because the profile route
// takes a whole object and writes whatever it recognises. A channel is the one
// setting on the account that decides whether a message reaches a person at
// all, and it should be changed by a request that is only ever about that.
//
// Availability is computed server-side rather than guessed at by the client.
// The browser cannot know whether Resend is configured or whether a
// subscription on another device is still alive, and offering a channel that
// cannot deliver is how an athlete ends up choosing silence.

export const dynamic = "force-dynamic";

const CHOICES = new Set(["AUTO", "SMS", "PUSH", "EMAIL"]);

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id as string;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      channelPreference: true,
      email: true,
      phoneNumber: true,
      phoneVerifiedAt: true,
      smsStatus: true,
      ianaTimezone: true,
    },
  });
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const emailProvider = getEmailProvider();
  const pushProvider = getPushProvider();
  const pushCount =
    pushProvider === null
      ? 0
      : await prisma.pushSubscription.count({ where: { userId, disabledAt: null } });

  const available = {
    sms: isSmsReady(user),
    push: pushProvider !== null && pushCount > 0,
    email: emailProvider !== null && Boolean(user.email),
  };

  // What AUTO would pick right now, so the UI can say so instead of leaving
  // "Automatic" as a word that means nothing to the person reading it.
  const resolved = resolveChannel({
    preference: user.channelPreference,
    smsReady: available.sms,
    pushReady: available.push,
    emailReady: available.email,
  });

  return NextResponse.json({
    preference: user.channelPreference,
    available,
    /** Null when nothing can reach them. */
    resolved: resolved.channel,
    /** Present only when nothing can. */
    reason: resolved.channel === null ? resolved.reason : null,
    /** Shown so they can check it is the right address before choosing email. */
    email: user.email,
    /** Required by every channel; without it nothing can be scheduled. */
    hasTimeZone: user.ianaTimezone !== null,
  });
}

export async function PUT(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id as string;

  const body = await req.json().catch(() => ({}));
  const preference = typeof body.preference === "string" ? body.preference : "";
  if (!CHOICES.has(preference)) {
    return NextResponse.json({ error: "Unknown channel." }, { status: 400 });
  }

  const data: { channelPreference: typeof preference; ianaTimezone?: string } = {
    channelPreference: preference as "AUTO" | "SMS" | "PUSH" | "EMAIL",
  };

  await prisma.user.update({
    where: { id: userId },
    data,
    select: { id: true },
  });

  // Choosing email is the one path onto a channel that needs no setup step of
  // its own, so it is also the one that can leave an athlete without a
  // timezone. Filling it from the browser here means they do not have to
  // enrol in texts just to be reachable by email.
  const zone = typeof body.timeZone === "string" ? body.timeZone : null;
  if (zone) {
    const { isValidTimeZone } = await import("@/lib/messaging/time");
    if (isValidTimeZone(zone)) {
      await prisma.user.updateMany({
        where: { id: userId, ianaTimezone: null },
        data: { ianaTimezone: zone },
      });
    }
  }

  return NextResponse.json({ ok: true, preference });
}
