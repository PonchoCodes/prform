import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isValidTimeZone } from "@/lib/messaging/time";

// Storing and removing one device's notification subscription.
//
// Same one-identity rule the team routes are held to: the row is written for
// the SESSION user, and there is no userId anywhere in the request contract.
// A subscription is a channel straight to a teenager's lock screen, so "which
// account does this endpoint belong to" is never something the client gets to
// assert.

/** Guards against a malformed or hostile body before anything is written. */
interface IncomingSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/**
 * Endpoints are URLs at the browser vendor's push service. Requiring https
 * costs nothing and refuses the obviously wrong shape early; the length bound
 * exists because nothing else in the request is bounded and this string is
 * stored verbatim.
 */
function parseSubscription(input: unknown): IncomingSubscription | null {
  if (!input || typeof input !== "object") return null;
  const sub = input as Record<string, unknown>;

  const endpoint = typeof sub.endpoint === "string" ? sub.endpoint.trim() : "";
  if (!endpoint.startsWith("https://") || endpoint.length > 2048) return null;

  const keys = sub.keys;
  if (!keys || typeof keys !== "object") return null;
  const { p256dh, auth } = keys as Record<string, unknown>;
  if (typeof p256dh !== "string" || typeof auth !== "string") return null;
  if (p256dh.length === 0 || p256dh.length > 256) return null;
  if (auth.length === 0 || auth.length > 256) return null;

  return { endpoint, keys: { p256dh, auth } };
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id as string;

  const body = await req.json().catch(() => ({}));
  const subscription = parseSubscription(body.subscription);
  if (!subscription) {
    return NextResponse.json({ error: "That isn't a push subscription." }, { status: 400 });
  }

  const userAgent = typeof body.userAgent === "string" ? body.userAgent.slice(0, 512) : null;
  const platform = typeof body.platform === "string" ? body.platform.slice(0, 32) : null;
  const now = new Date();

  // The endpoint is unique, so the same device re-registering updates its row
  // rather than accumulating duplicates that would each get their own copy of
  // every notification.
  //
  // The userId in `update` matters: an endpoint can legitimately change hands
  // when two people share a device and the second one signs in. Reassigning it
  // is right — the browser only has one subscription and it now belongs to
  // whoever is logged in. Leaving it pointed at the first account would send
  // one athlete's messages to the other's screen.
  await prisma.pushSubscription.upsert({
    where: { endpoint: subscription.endpoint },
    create: {
      userId,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      userAgent,
      platform,
    },
    update: {
      userId,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      userAgent,
      platform,
      lastSeenAt: now,
      // A device that has come back is not a failing device.
      failureCount: 0,
      disabledAt: null,
    },
  });

  // The timezone comes from the browser here, which is the only place we can
  // get it for an athlete who never enrolled in texts. Without it the send gate
  // refuses every message with "no_timezone", because the athlete's local
  // evening cannot be computed — so for a push-only user this line is what
  // makes the scheduled messages possible at all.
  //
  // Only ever fills a blank. An athlete who chose a zone during SMS enrolment
  // has said what they want, and a browser reporting something else because
  // they are at a meet out of state must not overwrite it.
  const zone = typeof body.timeZone === "string" ? body.timeZone : null;
  if (zone && isValidTimeZone(zone)) {
    await prisma.user.updateMany({
      where: { id: userId, ianaTimezone: null },
      data: { ianaTimezone: zone },
    });
  }

  // The consent record for the channel, set once and left alone. The
  // subscriptions themselves are disposable; this is the durable fact that
  // this person agreed to be notified.
  await prisma.user.updateMany({
    where: { id: userId, pushOptInAt: null },
    data: { pushOptInAt: now },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id as string;

  const body = await req.json().catch(() => ({}));
  const endpoint = typeof body.endpoint === "string" ? body.endpoint : null;

  // Scoped by userId as well as endpoint. Without it, knowing someone else's
  // endpoint string would be enough to switch their notifications off.
  const result = endpoint
    ? await prisma.pushSubscription.deleteMany({ where: { userId, endpoint } })
    : await prisma.pushSubscription.deleteMany({ where: { userId } });

  return NextResponse.json({ ok: true, removed: result.count });
}
