// The web push driver. The only file in the app that imports `web-push`,
// exactly as lib/messaging/twilio.ts is the only one that imports Twilio.
//
// Three things make this different from the SMS driver, and all three are
// visible in the code below rather than hidden behind a shim:
//
//   One athlete, many endpoints. A push goes to every live subscription they
//   have — phone, laptop, tablet. Partial success is the normal case, so the
//   result reports "did this reach anyone" rather than "did the send succeed".
//
//   Subscriptions rot. A browser prunes them, a reinstalled PWA mints a fresh
//   one, a wiped phone leaves a dead endpoint behind forever. 404 and 410 are
//   the push service telling us so, and the row is deleted on the spot — no
//   retry, no backoff, it is never coming back.
//
//   Nothing is scheduled. There is no push equivalent of Twilio's sendAt, so
//   `canSchedule` is false and the holding is done in our own ledger. See
//   lib/messaging/pushFlush.ts.

import webpush, { WebPushError } from "web-push";
import { prisma } from "@/lib/prisma";
import { vapidConfig } from "@/lib/push/vapid";
import type {
  CancelResult,
  OutboundOptions,
  OutboundProvider,
  Recipient,
  SendResult,
} from "@/lib/messaging/provider";

/**
 * How long a push service should hold a message for a device that is offline.
 *
 * Four hours, and short on purpose. These messages are about a specific
 * evening or a specific morning — "what time are you up tomorrow?" delivered
 * at noon the next day is not a late message, it is a wrong one. Better it
 * expires than arrives having become nonsense.
 */
const TTL_SECONDS = 4 * 60 * 60;

/** Status codes that mean the subscription is dead and will never work again. */
const GONE_STATUS_CODES = new Set([404, 410]);

/**
 * What the service worker receives. Kept small and versioned by shape rather
 * than a number: `public/sw.js` reads exactly these fields, and a payload it
 * cannot parse falls back to a generic notification rather than showing
 * nothing — a silent push is a permission the browser may take away.
 */
export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag?: string;
}

/**
 * The app's name, as it appears above every notification.
 *
 * Not the message's first line — the browser shows the title in bold and the
 * body beneath it, so putting content in the title would split one sentence
 * across two visual weights. The copy stays whole in the body.
 */
const NOTIFICATION_TITLE = "PRform";
const DEFAULT_URL = "/dashboard";

export class PushProvider implements OutboundProvider {
  readonly name = "web-push";
  readonly channel = "PUSH" as const;
  /** No push service offers scheduling. The flush pass does the holding. */
  readonly canSchedule = false;

  async schedule(): Promise<SendResult> {
    // Unreachable through sendMessage, which checks canSchedule first. Kept as
    // a hard failure rather than a silent immediate send: a message that was
    // meant for 06:00 arriving at 03:00 because a caller ignored the
    // capability flag is worse than one that visibly did not go.
    return {
      ok: false,
      providerMessageSid: null,
      providerStatus: null,
      error: "web push cannot schedule; hold the message and flush it when due",
    };
  }

  async sendNow(to: Recipient, body: string, opts?: OutboundOptions): Promise<SendResult> {
    if (to.channel !== "PUSH") {
      return {
        ok: false,
        providerMessageSid: null,
        providerStatus: null,
        error: `push driver was handed a ${to.channel} recipient`,
      };
    }

    const config = vapidConfig();
    if (!config) {
      return {
        ok: false,
        providerMessageSid: null,
        providerStatus: null,
        error: "vapid_not_configured",
      };
    }

    const subscriptions = await prisma.pushSubscription.findMany({
      where: { userId: to.userId, disabledAt: null },
      select: { id: true, endpoint: true, p256dh: true, auth: true },
    });

    if (subscriptions.length === 0) {
      // Not an error in the provider sense — there is simply nowhere to send.
      // The gate should have caught this first; reaching here means the
      // athlete's last device unsubscribed between the check and the send.
      return {
        ok: false,
        providerMessageSid: null,
        providerStatus: null,
        error: "no_live_subscriptions",
      };
    }

    const payload: PushPayload = {
      title: NOTIFICATION_TITLE,
      body,
      url: opts?.url ?? DEFAULT_URL,
      ...(opts?.tag ? { tag: opts.tag } : {}),
    };
    const serialized = JSON.stringify(payload);

    let delivered = 0;
    const dead: string[] = [];
    const failed: string[] = [];

    // Sequential rather than Promise.all. The realistic maximum is three or
    // four devices, and a burst of parallel requests to the same push service
    // is how a sender earns a rate limit.
    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          serialized,
          {
            TTL: TTL_SECONDS,
            vapidDetails: {
              subject: config.subject,
              publicKey: config.publicKey,
              privateKey: config.privateKey,
            },
          },
        );
        delivered++;
        await prisma.pushSubscription.update({
          where: { id: sub.id },
          data: { lastSuccessAt: new Date(), failureCount: 0 },
        });
      } catch (e) {
        const statusCode = e instanceof WebPushError ? e.statusCode : undefined;
        if (statusCode !== undefined && GONE_STATUS_CODES.has(statusCode)) {
          dead.push(sub.id);
        } else {
          failed.push(sub.id);
          console.error(
            `[push] send failed for subscription=${sub.id} status=${statusCode ?? "unknown"}: ${
              e instanceof Error ? e.message : String(e)
            }`,
          );
        }
      }
    }

    if (dead.length > 0) {
      // Deleted, not disabled. A 410 is the push service saying this endpoint
      // is permanently gone, and keeping the row would mean re-attempting a
      // send to it every evening for the rest of the athlete's account.
      await prisma.pushSubscription.deleteMany({ where: { id: { in: dead } } });
    }
    if (failed.length > 0) {
      await prisma.pushSubscription.updateMany({
        where: { id: { in: failed } },
        data: { failureCount: { increment: 1 } },
      });
    }

    if (delivered === 0) {
      return {
        ok: false,
        providerMessageSid: null,
        providerStatus: null,
        error:
          dead.length > 0 && failed.length === 0
            ? "all_subscriptions_expired"
            : "all_sends_failed",
      };
    }

    return {
      ok: true,
      // There is no single provider identifier to keep: a push service returns
      // no message id, and one send fanned out to several endpoints anyway.
      // Null here is honest, and it is what makes `cancel` a no-op below.
      providerMessageSid: null,
      providerStatus: `delivered ${delivered}/${subscriptions.length}`,
      error: null,
    };
  }

  async cancel(): Promise<CancelResult> {
    // A push already handed to a push service cannot be recalled, and one not
    // yet handed over is still sitting in our own ledger — where the caller
    // cancels it by updating the row, without needing the provider at all.
    return { ok: true, alreadyResolved: true, error: null };
  }
}

let cached: PushProvider | null = null;

/**
 * The push driver, or null when VAPID is not configured. Null is normal in an
 * environment where push has not been set up, and callers treat it the same
 * way they treat absent Twilio credentials: no provider, no send, no throw.
 */
export function getPushProvider(): OutboundProvider | null {
  if (!vapidConfig()) return null;
  if (!cached) cached = new PushProvider();
  return cached;
}

/** Whether this athlete has anywhere for a push to land. */
export async function hasLivePushSubscription(userId: string): Promise<boolean> {
  const count = await prisma.pushSubscription.count({
    where: { userId, disabledAt: null },
  });
  return count > 0;
}
