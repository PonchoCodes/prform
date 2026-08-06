// Issuing and checking phone verification codes.

import { createHmac, randomInt, timingSafeEqual } from "crypto";

/** Six digits is what people expect to type and what fits in one glance. */
const CODE_DIGITS = 6;

/** Short enough that a stolen code is usually already dead. */
export const CODE_TTL_MINUTES = 10;

/**
 * A six-digit code has a million possibilities, so the only thing standing
 * between an attacker and a verified number is the number of guesses allowed.
 * Five, then the code is spent.
 */
export const MAX_ATTEMPTS = 5;

/** Stops a resend button from becoming a way to text someone repeatedly. */
export const RESEND_COOLDOWN_SECONDS = 60;

/**
 * `randomInt` rather than `Math.random`: the latter is seeded from a value an
 * attacker can often infer, and a predictable verification code is not a
 * verification code.
 */
export function generateCode(): string {
  return String(randomInt(0, 10 ** CODE_DIGITS)).padStart(CODE_DIGITS, "0");
}

/**
 * HMAC rather than a bare hash. A plain SHA-256 of a six-digit code is
 * reversible by trying all million inputs in well under a second, so a database
 * dump would hand over every live code. Keyed with the app secret, the digests
 * are useless without it.
 */
export function hashCode(code: string, phoneNumber: string): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    // Refusing is correct: silently falling back to an unkeyed hash would
    // downgrade the protection at exactly the moment nobody is looking.
    throw new Error("NEXTAUTH_SECRET is required to hash verification codes");
  }
  // The number is bound into the digest so a code issued for one number cannot
  // be replayed against another.
  return createHmac("sha256", secret).update(`${phoneNumber}:${code}`).digest("hex");
}

/**
 * Constant-time comparison. A normal string compare returns faster the earlier
 * it finds a difference, which leaks the code one character at a time to
 * anyone willing to measure.
 */
export function codeMatches(input: string, storedHash: string, phoneNumber: string): boolean {
  let expected: Buffer;
  try {
    expected = Buffer.from(hashCode(input, phoneNumber), "hex");
  } catch {
    return false;
  }
  const stored = Buffer.from(storedHash, "hex");
  if (stored.length !== expected.length) return false;
  return timingSafeEqual(stored, expected);
}

export function codeExpiry(now: Date): Date {
  return new Date(now.getTime() + CODE_TTL_MINUTES * 60_000);
}
