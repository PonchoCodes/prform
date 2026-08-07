import { describe, it, expect } from "vitest";
import { isSmsReady, resolveChannel } from "@/lib/messaging/channel";

describe("resolveChannel — AUTO", () => {
  it("prefers SMS when both channels are available", () => {
    expect(resolveChannel({ preference: "AUTO", smsReady: true, pushReady: true, emailReady: false })).toEqual({
      channel: "SMS",
    });
  });

  it("falls back to push when SMS is not set up — the pilot's whole case", () => {
    expect(resolveChannel({ preference: "AUTO", smsReady: false, pushReady: true, emailReady: false })).toEqual({
      channel: "PUSH",
    });
  });

  it("uses SMS when there is no subscribed device", () => {
    expect(resolveChannel({ preference: "AUTO", smsReady: true, pushReady: false, emailReady: false })).toEqual({
      channel: "SMS",
    });
  });

  it("reports nothing configured rather than picking a channel that cannot deliver", () => {
    expect(resolveChannel({ preference: "AUTO", smsReady: false, pushReady: false, emailReady: false })).toEqual({
      channel: null,
      reason: "nothing_configured",
    });
  });
});

describe("resolveChannel — an explicit choice is an instruction", () => {
  it("sends by SMS when asked, even with a subscribed device sitting there", () => {
    expect(resolveChannel({ preference: "SMS", smsReady: true, pushReady: true, emailReady: false })).toEqual({
      channel: "SMS",
    });
  });

  it("sends by push when asked, even with a verified number sitting there", () => {
    expect(resolveChannel({ preference: "PUSH", smsReady: true, pushReady: true, emailReady: false })).toEqual({
      channel: "PUSH",
    });
  });

  it("does not quietly substitute the other channel when the chosen one is unavailable", () => {
    // The substitution is the bug this pins. An athlete who asked for texts and
    // received a phone notification instead has been overruled by software, and
    // the named reason is what makes the silence diagnosable.
    expect(resolveChannel({ preference: "SMS", smsReady: false, pushReady: true, emailReady: false })).toEqual({
      channel: null,
      reason: "sms_not_ready",
    });
    expect(resolveChannel({ preference: "PUSH", smsReady: true, pushReady: false, emailReady: false })).toEqual({
      channel: null,
      reason: "push_not_ready",
    });
  });
});

describe("resolveChannel — email is the floor", () => {
  it("falls to email when there is no number and no device", () => {
    // Every account has an address, so this branch always catches. An athlete
    // who will not install a PWA and will not give a phone number is otherwise
    // unreachable, and unreachable is worse than slow.
    expect(
      resolveChannel({ preference: "AUTO", smsReady: false, pushReady: false, emailReady: true }),
    ).toEqual({ channel: "EMAIL" });
  });

  it("is ranked below both of the others under AUTO", () => {
    // The ordering is a ranking of how likely a message is to be read at 21:00
    // by a sixteen-year-old, and email loses to both.
    expect(
      resolveChannel({ preference: "AUTO", smsReady: false, pushReady: true, emailReady: true }),
    ).toEqual({ channel: "PUSH" });
    expect(
      resolveChannel({ preference: "AUTO", smsReady: true, pushReady: true, emailReady: true }),
    ).toEqual({ channel: "SMS" });
  });

  it("is used when asked for, over anything else that is available", () => {
    expect(
      resolveChannel({ preference: "EMAIL", smsReady: true, pushReady: true, emailReady: true }),
    ).toEqual({ channel: "EMAIL" });
  });

  it("does not substitute another channel when email was asked for and cannot send", () => {
    expect(
      resolveChannel({ preference: "EMAIL", smsReady: true, pushReady: true, emailReady: false }),
    ).toEqual({ channel: null, reason: "email_not_ready" });
  });

  it("still reports nothing configured when even email is unavailable", () => {
    // Resend unconfigured, which is the normal state locally.
    expect(
      resolveChannel({ preference: "AUTO", smsReady: false, pushReady: false, emailReady: false }),
    ).toEqual({ channel: null, reason: "nothing_configured" });
  });
});

describe("isSmsReady", () => {
  const ready = {
    phoneNumber: "+15551234567",
    phoneVerifiedAt: new Date("2026-08-01T00:00:00Z"),
    smsStatus: "ACTIVE" as const,
    ianaTimezone: "America/New_York",
  };

  it("admits a fully set-up athlete", () => {
    expect(isSmsReady(ready)).toBe(true);
  });

  it("refuses when any one piece is missing", () => {
    expect(isSmsReady({ ...ready, phoneNumber: null })).toBe(false);
    expect(isSmsReady({ ...ready, phoneVerifiedAt: null })).toBe(false);
    expect(isSmsReady({ ...ready, ianaTimezone: null })).toBe(false);
  });

  it("refuses an athlete who texted STOP, and one never verified", () => {
    expect(isSmsReady({ ...ready, smsStatus: "STOPPED" })).toBe(false);
    expect(isSmsReady({ ...ready, smsStatus: "UNVERIFIED" })).toBe(false);
  });

  it("a STOPPED athlete falls through here, and is caught by the gate instead", () => {
    // Worth stating because the two layers look like they disagree. This
    // function answers "can SMS reach them", and for someone who texted STOP
    // the answer is no — so AUTO routes to push. The gate is what then refuses
    // the push as well, with reason "stopped": telling us to stop means stop,
    // on every channel. Neither layer alone expresses that; the pair does.
    const stopped = isSmsReady({ ...ready, smsStatus: "STOPPED" });
    expect(stopped).toBe(false);
    expect(resolveChannel({ preference: "AUTO", smsReady: stopped, pushReady: true, emailReady: false })).toEqual({
      channel: "PUSH",
    });
  });
});
