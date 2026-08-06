import { describe, it, expect } from "vitest";
import {
  cleanJoinCode,
  generateJoinCode,
  isWellFormedJoinCode,
  JOIN_CODE_ALPHABET,
  JOIN_CODE_LENGTH,
  joinCodeExpiry,
  JOIN_CODE_TTL_DAYS,
} from "@/lib/team/joinCode";

describe("generateJoinCode", () => {
  it("emits codes of the right length from the unambiguous alphabet", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateJoinCode();
      expect(code).toHaveLength(JOIN_CODE_LENGTH);
      for (const c of code) expect(JOIN_CODE_ALPHABET).toContain(c);
    }
  });

  it("never contains the read-aloud confusables", () => {
    for (let i = 0; i < 200; i++) {
      expect(generateJoinCode()).not.toMatch(/[0O1IL]/);
    }
  });
});

describe("cleanJoinCode / isWellFormedJoinCode", () => {
  it("case and separators never invalidate a code", () => {
    expect(cleanJoinCode("km2 9tr")).toBe("KM29TR");
    expect(cleanJoinCode("KM2-9TR")).toBe("KM29TR");
    expect(isWellFormedJoinCode("km2 9tr")).toBe(true);
  });

  it("rejects wrong length and characters outside the alphabet", () => {
    expect(isWellFormedJoinCode("KM29T")).toBe(false);
    expect(isWellFormedJoinCode("KM29TRX")).toBe(false);
    expect(isWellFormedJoinCode("KM20TR")).toBe(false); // 0 cannot occur
    expect(isWellFormedJoinCode("")).toBe(false);
  });
});

describe("joinCodeExpiry", () => {
  it("is the TTL out from the given instant", () => {
    const from = new Date("2026-08-06T00:00:00.000Z");
    const expiry = joinCodeExpiry(from);
    const days = (expiry.getTime() - from.getTime()) / 86400000;
    expect(days).toBe(JOIN_CODE_TTL_DAYS);
  });
});
