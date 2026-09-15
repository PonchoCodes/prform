// Pilot codes: 8 characters, handed to one coach, redeemable once.
//
// The alphabet drops O, 0, I and 1. These codes get read off a phone screen in
// a gym and typed into another phone, and a coach who cannot tell an O from a
// zero does not conclude that they misread it. They conclude the product is
// broken. 32 characters left, which divides 256 exactly, so a byte maps to a
// character with no modulo bias and no rejection loop.
//
// Pure: no prisma, no randomness policy beyond the CSPRNG. Uniqueness is the
// database's job (PilotCode.code is unique) and the caller retries on a
// collision. At 32^8 that is roughly one in a trillion, but "roughly never"
// is not the same as "handled".

import { randomBytes } from "crypto";

export const PILOT_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
export const PILOT_CODE_LENGTH = 8;

export function generatePilotCode(): string {
  const bytes = randomBytes(PILOT_CODE_LENGTH);
  let out = "";
  for (let i = 0; i < PILOT_CODE_LENGTH; i++) {
    out += PILOT_CODE_ALPHABET[bytes[i] % PILOT_CODE_ALPHABET.length];
  }
  return out;
}

/**
 * What a coach typed, turned into what we stored. Uppercased, with spaces and
 * dashes dropped: people space codes in groups of four, and refusing that is
 * refusing a correct code.
 */
export function cleanPilotCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[\s-]/g, "");
}

export function isWellFormedPilotCode(code: string): boolean {
  if (code.length !== PILOT_CODE_LENGTH) return false;
  for (const ch of code) {
    if (!PILOT_CODE_ALPHABET.includes(ch)) return false;
  }
  return true;
}
