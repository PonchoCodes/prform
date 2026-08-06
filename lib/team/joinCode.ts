// Join codes: what an athlete types to put themselves on a roster.
//
// The alphabet drops 0/O, 1/I/L and B/8-adjacent ambiguity where it can —
// codes get read out loud across a locker room. Because the confusable
// characters can never appear in a generated code, input handling is simply
// uppercase-and-strip-separators; there is nothing to "correct" a 0 into.

import { randomInt } from "node:crypto";

export const JOIN_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const JOIN_CODE_LENGTH = 6;

/** How long a code works before the coach has to mint a fresh one. */
export const JOIN_CODE_TTL_DAYS = 14;

export function generateJoinCode(): string {
  let code = "";
  for (let i = 0; i < JOIN_CODE_LENGTH; i++) {
    code += JOIN_CODE_ALPHABET[randomInt(JOIN_CODE_ALPHABET.length)];
  }
  return code;
}

/** "km2 9tr" → "KM29TR". Separators and case never make a code invalid. */
export function cleanJoinCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, "");
}

export function isWellFormedJoinCode(input: string): boolean {
  const cleaned = cleanJoinCode(input);
  return (
    cleaned.length === JOIN_CODE_LENGTH &&
    cleaned.split("").every((c) => JOIN_CODE_ALPHABET.includes(c))
  );
}

export function joinCodeExpiry(from: Date = new Date()): Date {
  return new Date(from.getTime() + JOIN_CODE_TTL_DAYS * 24 * 60 * 60 * 1000);
}
