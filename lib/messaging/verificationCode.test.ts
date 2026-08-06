import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  codeMatches,
  generateCode,
  hashCode,
  MAX_ATTEMPTS,
  CODE_TTL_MINUTES,
} from "@/lib/messaging/verificationCode";

const PHONE = "+15551234567";
const OTHER_PHONE = "+15559999999";

let previousSecret: string | undefined;
beforeAll(() => {
  previousSecret = process.env.NEXTAUTH_SECRET;
  process.env.NEXTAUTH_SECRET = "test-secret-for-hmac";
});
afterAll(() => {
  if (previousSecret === undefined) delete process.env.NEXTAUTH_SECRET;
  else process.env.NEXTAUTH_SECRET = previousSecret;
});

describe("generateCode", () => {
  it("is always six digits, including when the value is small", () => {
    for (let i = 0; i < 500; i++) {
      const code = generateCode();
      expect(code).toMatch(/^\d{6}$/);
    }
  });

  it("does not repeat itself in any obvious way", () => {
    const seen = new Set(Array.from({ length: 200 }, () => generateCode()));
    // Birthday collisions are possible across a million values but a
    // deterministic or low-entropy generator would collapse far harder.
    expect(seen.size).toBeGreaterThan(190);
  });
});

describe("hashCode", () => {
  it("is stable for the same code and number", () => {
    expect(hashCode("123456", PHONE)).toBe(hashCode("123456", PHONE));
  });

  it("binds the digest to the number, so a code cannot be replayed elsewhere", () => {
    expect(hashCode("123456", PHONE)).not.toBe(hashCode("123456", OTHER_PHONE));
  });

  it("does not contain the code", () => {
    expect(hashCode("123456", PHONE)).not.toContain("123456");
  });

  it("refuses to run without a key rather than falling back to a bare hash", () => {
    const saved = process.env.NEXTAUTH_SECRET;
    delete process.env.NEXTAUTH_SECRET;
    expect(() => hashCode("123456", PHONE)).toThrow(/NEXTAUTH_SECRET/);
    process.env.NEXTAUTH_SECRET = saved;
  });
});

describe("codeMatches", () => {
  it("accepts the right code", () => {
    expect(codeMatches("123456", hashCode("123456", PHONE), PHONE)).toBe(true);
  });

  it("rejects the wrong code, the wrong number, and rubbish", () => {
    const stored = hashCode("123456", PHONE);
    expect(codeMatches("123457", stored, PHONE)).toBe(false);
    expect(codeMatches("123456", stored, OTHER_PHONE)).toBe(false);
    expect(codeMatches("", stored, PHONE)).toBe(false);
    expect(codeMatches("12345678", stored, PHONE)).toBe(false);
  });

  it("does not throw on a malformed stored hash", () => {
    // A truncated or non-hex column value must fail closed, not crash the
    // route and leave the athlete unable to verify at all.
    expect(codeMatches("123456", "not-hex", PHONE)).toBe(false);
    expect(codeMatches("123456", "", PHONE)).toBe(false);
    expect(codeMatches("123456", "abcd", PHONE)).toBe(false);
  });
});

describe("the limits themselves", () => {
  it("keeps a brute force well short of a million guesses", () => {
    expect(MAX_ATTEMPTS).toBeLessThanOrEqual(5);
    expect(CODE_TTL_MINUTES).toBeLessThanOrEqual(15);
  });
});
