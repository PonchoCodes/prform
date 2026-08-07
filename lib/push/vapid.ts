// VAPID configuration for web push, read in one place.
//
// Same posture as lib/messaging/config.ts: a missing or malformed variable
// fails toward silence rather than toward sending. The failure mode here is
// gentler than SMS — an unsent push is not an unwanted text — but the reason
// to centralize is the same, and a half-configured key pair produces pushes
// the browser silently rejects, which is far harder to notice than an error.

export interface VapidConfig {
  publicKey: string;
  privateKey: string;
  /** "mailto:" or an https URL. Push services use it to contact us about abuse. */
  subject: string;
}

/**
 * A VAPID key is a P-256 point, base64url encoded: 65 raw bytes for the public
 * key (0x04 || X || Y) and 32 for the private one. Checked by length rather
 * than parsed, which is enough to catch the realistic mistake — a truncated
 * paste, or the two keys swapped.
 */
const PUBLIC_KEY_LENGTH = 87;
const PRIVATE_KEY_LENGTH = 43;

const BASE64URL = /^[A-Za-z0-9_-]+$/;

function wellFormed(key: string, expectedLength: number): boolean {
  return key.length === expectedLength && BASE64URL.test(key);
}

/**
 * The configured key pair, or null when it is absent or malformed. Null is a
 * normal state locally and in any environment where push has not been set up;
 * callers treat it as "no push provider" and fall through to whatever else is
 * available, exactly as the SMS layer treats absent Twilio credentials.
 *
 * Deliberately not cached: an environment variable changing between requests
 * on a warm lambda should take effect, and this costs two string compares.
 */
export function vapidConfig(): VapidConfig | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;

  if (!publicKey || !privateKey || !subject) return null;

  if (!wellFormed(publicKey, PUBLIC_KEY_LENGTH)) {
    console.error(
      "[push] VAPID_PUBLIC_KEY is not a base64url P-256 public key — push is disabled",
    );
    return null;
  }
  if (!wellFormed(privateKey, PRIVATE_KEY_LENGTH)) {
    console.error(
      "[push] VAPID_PRIVATE_KEY is not a base64url P-256 private key — push is disabled",
    );
    return null;
  }
  // A push service will reject a subject it cannot contact us through, and it
  // rejects at send time with an opaque 403, so it is checked here instead.
  if (!/^(mailto:|https:\/\/)/.test(subject)) {
    console.error(
      '[push] VAPID_SUBJECT must be a "mailto:" or "https://" URL — push is disabled',
    );
    return null;
  }

  return { publicKey, privateKey, subject };
}

/**
 * The public key alone, for the browser. Safe to serve to anyone — it is the
 * key subscriptions are minted against, and it is public by design.
 */
export function vapidPublicKey(): string | null {
  return vapidConfig()?.publicKey ?? null;
}

export function isPushConfigured(): boolean {
  return vapidConfig() !== null;
}

/**
 * The global brake for push, mirroring SMS_KILL_SWITCH. Separate switches on
 * purpose: the channels fail independently, and stopping a runaway push loop
 * should not also silence the SMS layer.
 */
export function isPushKillSwitchOn(): boolean {
  const raw = process.env.PUSH_KILL_SWITCH;
  if (raw === undefined || raw === "") return false;
  return !["false", "0", "no", "off"].includes(raw.trim().toLowerCase());
}
