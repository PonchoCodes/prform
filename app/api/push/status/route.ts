import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { vapidPublicKey } from "@/lib/push/vapid";

// Everything the client needs to decide what to show about notifications, in
// one request: the key to subscribe with, whether this account already has a
// device subscribed, whether the install notice has been dismissed, and whether
// they have logged a night yet.
//
// One round trip rather than four because all of it is needed before the first
// paint of the notice, and four sequential fetches on a phone on school wifi is
// how a banner ends up flashing in half a second after the page settles.
//
// The VAPID public key is public by construction — it is the key subscriptions
// are minted against, and every subscribed browser already holds a copy.

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id as string;

  const [user, subscriptionCount, sleepLogCount] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        installPromptDismissedAt: true,
        pushOptInAt: true,
        channelPreference: true,
        ianaTimezone: true,
      },
    }),
    prisma.pushSubscription.count({ where: { userId, disabledAt: null } }),
    // Capped: the question is "have they logged anything", and counting a
    // year of nights to answer it is work for no reason.
    prisma.sleepLog.count({ where: { userId }, take: 1 }),
  ]);

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json({
    publicKey: vapidPublicKey(),
    /** Live subscriptions on THIS account, across every device they use. */
    subscribed: subscriptionCount > 0,
    subscriptionCount,
    optedInAt: user.pushOptInAt,
    channelPreference: user.channelPreference,
    installPromptDismissed: user.installPromptDismissedAt !== null,
    /**
     * The gate on the install prompt: it appears once someone has logged a
     * night, not on first visit. Asking for a home-screen icon before the app
     * has done anything for them is how a prompt gets dismissed reflexively —
     * and a dismissed prompt is spent.
     */
    hasLoggedNight: sleepLogCount > 0,
    /** Already known, so the client can skip asking the browser for it. */
    timeZoneKnown: user.ianaTimezone !== null,
  });
}
