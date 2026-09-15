import { describe, it, expect } from "vitest";
import { renewalQuoteCents, renewalCents, TIERS } from "@/lib/teamBilling";

describe("renewalQuoteCents: the one source for the amount a notice quotes", () => {
  it("quotes the locked Team price for a pilot, whatever its seat limit says", () => {
    expect(renewalQuoteCents({ source: "PILOT", seatLimit: 40 })).toBe(TIERS.TEAM.lockedCents);
    expect(renewalQuoteCents({ source: "PILOT", seatLimit: 8 })).toBe(9900);
  });

  it("quotes list price by tier for a paid team", () => {
    expect(renewalQuoteCents({ source: "PAID", seatLimit: 40 })).toBe(renewalCents("TEAM", "PAID"));
    expect(renewalQuoteCents({ source: "PAID", seatLimit: 100 })).toBe(renewalCents("PROGRAM", "PAID"));
  });
});
