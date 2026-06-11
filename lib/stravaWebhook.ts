// Strava webhook subscriptions are PER APPLICATION, not per athlete.
// One subscription serves every connected user, so subscription state lives
// here (and at Strava), never on the User model.

const STRAVA_API = "https://www.strava.com/api/v3";

export interface StravaSubscription {
  id: number;
  callback_url: string;
}

interface WebhookConfig {
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
  verifyToken: string;
}

function getConfig(): WebhookConfig | null {
  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  const callbackUrl = process.env.STRAVA_WEBHOOK_CALLBACK_URL;
  const verifyToken = process.env.STRAVA_WEBHOOK_VERIFY_TOKEN;
  if (!clientId || !clientSecret || !callbackUrl || !verifyToken) {
    return null;
  }
  return { clientId, clientSecret, callbackUrl, verifyToken };
}

async function listSubscriptions(cfg: WebhookConfig): Promise<StravaSubscription[]> {
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
  });
  const res = await fetch(`${STRAVA_API}/push_subscriptions?${params}`, {
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Strava push_subscriptions list failed: ${res.status}`);
  }
  return res.json();
}

// Cache the active check in module scope so the status endpoint doesn't hit
// Strava on every page load. 10 minute TTL.
const CHECK_TTL_MS = 10 * 60 * 1000;
let checkCache: { active: boolean; expiresAt: number } | null = null;

/**
 * Idempotent: makes sure exactly one subscription exists pointing at our
 * production webhook URL. Deletes stale subscriptions (e.g. ones registered
 * against a preview deployment) before creating the correct one.
 */
export async function ensureWebhookSubscription(): Promise<StravaSubscription | null> {
  const cfg = getConfig();
  if (!cfg) {
    console.error("[stravaWebhook] missing env config (STRAVA_WEBHOOK_CALLBACK_URL?)");
    return null;
  }

  try {
    const subs = await listSubscriptions(cfg);

    const correct = subs.find((s) => s.callback_url === cfg.callbackUrl);
    if (correct) {
      checkCache = { active: true, expiresAt: Date.now() + CHECK_TTL_MS };
      return correct;
    }

    // Strava allows one subscription per app — remove any wrongly-pointed ones
    for (const stale of subs) {
      const params = new URLSearchParams({
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
      });
      const del = await fetch(`${STRAVA_API}/push_subscriptions/${stale.id}?${params}`, {
        method: "DELETE",
      });
      if (!del.ok && del.status !== 404) {
        console.error(`[stravaWebhook] failed to delete stale subscription ${stale.id}: ${del.status}`);
      }
    }

    // Strava synchronously GETs the callback URL with a verification
    // challenge during this request — our webhook GET handler answers it.
    const createRes = await fetch(`${STRAVA_API}/push_subscriptions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        callback_url: cfg.callbackUrl,
        verify_token: cfg.verifyToken,
      }),
    });

    if (!createRes.ok) {
      console.error("[stravaWebhook] create failed", createRes.status, await createRes.text());
      return null;
    }

    const created: StravaSubscription = await createRes.json();
    checkCache = { active: true, expiresAt: Date.now() + CHECK_TTL_MS };
    return created;
  } catch (err) {
    console.error("[stravaWebhook] ensureWebhookSubscription", err);
    return null;
  }
}

/**
 * Read-only check used by the status endpoint: is a subscription pointing at
 * our production webhook URL? Cached for 10 minutes.
 */
export async function checkWebhookSubscription(): Promise<boolean> {
  if (checkCache && Date.now() < checkCache.expiresAt) {
    return checkCache.active;
  }

  const cfg = getConfig();
  if (!cfg) return false;

  try {
    const subs = await listSubscriptions(cfg);
    const active = subs.some((s) => s.callback_url === cfg.callbackUrl);
    checkCache = { active, expiresAt: Date.now() + CHECK_TTL_MS };
    return active;
  } catch (err) {
    console.error("[stravaWebhook] checkWebhookSubscription", err);
    // Serve the stale value rather than flapping to "inactive" on a blip
    return checkCache?.active ?? false;
  }
}
