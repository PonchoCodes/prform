import { describe, it, expect } from "vitest";
import { evaluateSendGate, isOncePerDay, type GateSubject } from "@/lib/messaging/gate";

/** An athlete who has completed onboarding and confirmed their number. */
function subject(overrides: Partial<GateSubject> = {}): GateSubject {
  return {
    phoneNumber: "+15551234567",
    phoneVerifiedAt: new Date("2026-08-01T12:00:00Z"),
    smsStatus: "ACTIVE",
    ianaTimezone: "America/New_York",
    ...overrides,
  };
}

function gate(overrides: Partial<Parameters<typeof evaluateSendGate>[0]> = {}) {
  return evaluateSendGate({
    subject: subject(),
    messageType: "EVENING_WAKE_QUESTION",
    sentToday: 0,
    cap: 5,
    killSwitch: false,
    ...overrides,
  });
}

describe("the send gate", () => {
  it("lets a verified, active athlete through", () => {
    expect(gate()).toEqual({ allowed: true });
  });

  it("refuses an unverified number", () => {
    expect(gate({ subject: subject({ phoneVerifiedAt: null }) })).toEqual({
      allowed: false,
      reason: "not_verified",
    });
    // Status and timestamp disagreeing is still a refusal, in both directions.
    expect(gate({ subject: subject({ smsStatus: "UNVERIFIED" }) })).toEqual({
      allowed: false,
      reason: "not_verified",
    });
  });

  it("refuses anyone who has stopped", () => {
    expect(gate({ subject: subject({ smsStatus: "STOPPED" }) })).toEqual({
      allowed: false,
      reason: "stopped",
    });
  });

  it("reports STOP ahead of a missing verification, never the other way round", () => {
    // Both conditions hold. The log line has to name the serious one.
    const decision = gate({
      subject: subject({ smsStatus: "STOPPED", phoneVerifiedAt: null }),
    });
    expect(decision).toEqual({ allowed: false, reason: "stopped" });
  });

  it("refuses when there is no number or no timezone", () => {
    expect(gate({ subject: subject({ phoneNumber: null }) })).toEqual({
      allowed: false,
      reason: "no_phone_number",
    });
    expect(gate({ subject: subject({ ianaTimezone: null }) })).toEqual({
      allowed: false,
      reason: "no_timezone",
    });
  });

  it("stops at the daily cap", () => {
    expect(gate({ sentToday: 4, cap: 5 })).toEqual({ allowed: true });
    expect(gate({ sentToday: 5, cap: 5 })).toEqual({ allowed: false, reason: "daily_cap" });
    expect(gate({ sentToday: 99, cap: 5 })).toEqual({ allowed: false, reason: "daily_cap" });
    // A cap of zero is a valid way to mute one athlete without stopping them.
    expect(gate({ sentToday: 0, cap: 0 })).toEqual({ allowed: false, reason: "daily_cap" });
  });

  it("stops everything when the kill switch is on", () => {
    for (const messageType of [
      "EVENING_WAKE_QUESTION",
      "MORNING_VERDICT",
      "BED_ACK",
      "HELP_REPLY",
      "STOP_ACK",
      "VERIFICATION_CODE",
    ] as const) {
      expect(gate({ messageType, killSwitch: true }), messageType).toEqual({
        allowed: false,
        reason: "kill_switch",
      });
    }
  });
});

describe("the verification carve-out", () => {
  it("allows a code to reach a number that is not yet verified", () => {
    const decision = gate({
      messageType: "VERIFICATION_CODE",
      subject: subject({ phoneVerifiedAt: null, smsStatus: "UNVERIFIED" }),
    });
    expect(decision).toEqual({ allowed: true });
  });

  it("does not exempt a code from any other rail", () => {
    const stopped = gate({
      messageType: "VERIFICATION_CODE",
      subject: subject({ phoneVerifiedAt: null, smsStatus: "STOPPED" }),
    });
    expect(stopped).toEqual({ allowed: false, reason: "stopped" });

    const capped = gate({ messageType: "VERIFICATION_CODE", sentToday: 5, cap: 5 });
    expect(capped).toEqual({ allowed: false, reason: "daily_cap" });

    const killed = gate({ messageType: "VERIFICATION_CODE", killSwitch: true });
    expect(killed).toEqual({ allowed: false, reason: "kill_switch" });
  });

  it("is the only type that bypasses verification", () => {
    for (const messageType of [
      "EVENING_WAKE_QUESTION",
      "MORNING_VERDICT",
      "LIGHTS_OUT",
      "BED_ACK",
      "CLARIFICATION",
      "HELP_REPLY",
      "STOP_ACK",
    ] as const) {
      const decision = gate({
        messageType,
        subject: subject({ phoneVerifiedAt: null, smsStatus: "UNVERIFIED" }),
      });
      expect(decision, messageType).toEqual({ allowed: false, reason: "not_verified" });
    }
  });
});

describe("the push channel", () => {
  /** The pilot's athlete: a subscribed device and no phone number at all. */
  function pushSubject(overrides: Partial<GateSubject> = {}): GateSubject {
    return {
      phoneNumber: null,
      phoneVerifiedAt: null,
      smsStatus: "UNVERIFIED",
      ianaTimezone: "America/New_York",
      hasPushSubscription: true,
      ...overrides,
    };
  }

  function pushGate(overrides: Partial<Parameters<typeof evaluateSendGate>[0]> = {}) {
    return evaluateSendGate({
      subject: pushSubject(),
      messageType: "EVENING_WAKE_QUESTION",
      sentToday: 0,
      cap: 5,
      killSwitch: false,
      channel: "PUSH",
      ...overrides,
    });
  }

  it("lets through an athlete with no phone number — the entire pilot", () => {
    // The rail this pins is the one that would have blocked every push during
    // the month without SMS: a phone check applied to a channel that has
    // nothing to do with phones.
    expect(pushGate()).toEqual({ allowed: true });
  });

  it("refuses when no device is subscribed", () => {
    expect(pushGate({ subject: pushSubject({ hasPushSubscription: false }) })).toEqual({
      allowed: false,
      reason: "no_push_subscription",
    });
  });

  it("still requires a timezone — it is how the local day is computed", () => {
    expect(pushGate({ subject: pushSubject({ ianaTimezone: null }) })).toEqual({
      allowed: false,
      reason: "no_timezone",
    });
  });

  it("honours STOP on push too", () => {
    // Someone who told us to stop has told us to stop. Delivering the same
    // message by another road because STOP is an SMS word is the behaviour this
    // test exists to prevent.
    expect(pushGate({ subject: pushSubject({ smsStatus: "STOPPED" }) })).toEqual({
      allowed: false,
      reason: "stopped",
    });
  });

  it("does not ask a push to be phone-verified", () => {
    const decision = pushGate({
      messageType: "MORNING_VERDICT",
      subject: pushSubject({ phoneVerifiedAt: null, smsStatus: "UNVERIFIED" }),
    });
    expect(decision).toEqual({ allowed: true });
  });

  it("counts against the same daily cap as texts", () => {
    // One ledger, one budget: the athlete's attention does not have a separate
    // allowance for a notification.
    expect(pushGate({ sentToday: 5, cap: 5 })).toEqual({ allowed: false, reason: "daily_cap" });
  });

  it("stops for the kill switch", () => {
    expect(pushGate({ killSwitch: true })).toEqual({ allowed: false, reason: "kill_switch" });
  });

  it("defaults to SMS when no channel is named, so pre-push callers are unchanged", () => {
    const noChannel = evaluateSendGate({
      subject: pushSubject(),
      messageType: "EVENING_WAKE_QUESTION",
      sentToday: 0,
      cap: 5,
      killSwitch: false,
    });
    expect(noChannel).toEqual({ allowed: false, reason: "no_phone_number" });
  });
});

describe("the email channel", () => {
  /** An athlete with an address and nothing else. */
  function emailSubject(overrides: Partial<GateSubject> = {}): GateSubject {
    return {
      phoneNumber: null,
      phoneVerifiedAt: null,
      smsStatus: "UNVERIFIED",
      ianaTimezone: "America/New_York",
      emailAddress: "athlete@example.test",
      ...overrides,
    };
  }

  function emailGate(overrides: Partial<Parameters<typeof evaluateSendGate>[0]> = {}) {
    return evaluateSendGate({
      subject: emailSubject(),
      messageType: "MORNING_VERDICT",
      sentToday: 0,
      cap: 5,
      killSwitch: false,
      channel: "EMAIL",
      ...overrides,
    });
  }

  it("lets through an athlete with only an address", () => {
    expect(emailGate()).toEqual({ allowed: true });
  });

  it("refuses when there is no address", () => {
    expect(emailGate({ subject: emailSubject({ emailAddress: null }) })).toEqual({
      allowed: false,
      reason: "no_email_address",
    });
  });

  it("does not ask an email to be phone-verified or push-subscribed", () => {
    expect(emailGate({ subject: emailSubject({ phoneVerifiedAt: null }) })).toEqual({
      allowed: true,
    });
  });

  it("still requires a timezone", () => {
    expect(emailGate({ subject: emailSubject({ ianaTimezone: null }) })).toEqual({
      allowed: false,
      reason: "no_timezone",
    });
  });

  it("honours STOP on email too", () => {
    // Same rule as push. Somebody who told us to stop has told us to stop, and
    // the channel the word arrived on does not narrow what it meant.
    expect(emailGate({ subject: emailSubject({ smsStatus: "STOPPED" }) })).toEqual({
      allowed: false,
      reason: "stopped",
    });
  });

  it("counts against the same daily cap", () => {
    expect(emailGate({ sentToday: 5, cap: 5 })).toEqual({ allowed: false, reason: "daily_cap" });
  });
});

describe("once-per-day types", () => {
  it("covers exactly the two the cron owns", () => {
    expect(isOncePerDay("EVENING_WAKE_QUESTION")).toBe(true);
    expect(isOncePerDay("MORNING_VERDICT")).toBe(true);
  });

  it("leaves reactive replies free to recur", () => {
    // Two unparseable messages in a day deserve two clarifications, and a split
    // night produces two BED acknowledgments.
    for (const messageType of [
      "LIGHTS_OUT",
      "BED_ACK",
      "CLARIFICATION",
      "HELP_REPLY",
      "STOP_ACK",
      "VERIFICATION_CODE",
    ] as const) {
      expect(isOncePerDay(messageType), messageType).toBe(false);
    }
  });
});
