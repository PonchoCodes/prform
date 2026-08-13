import { describe, it, expect } from "vitest";
import {
  shouldShowInstallPrompt,
  PWA_PROMPT_COOLDOWN_DAYS,
  PWA_PROMPT_MAX_SHOWS,
  type PwaPromptInput,
} from "./pwaPrompt";

const NOW = new Date("2026-08-12T20:00:00Z");

/** An athlete the modal should appear for, so each test changes one thing. */
function eligible(overrides: Partial<PwaPromptInput> = {}): PwaPromptInput {
  return {
    onboardingDone: true,
    standalone: false,
    platform: "ios",
    pwaPromptState: null,
    pwaPromptDismissedAt: null,
    pwaPromptShowCount: 0,
    now: NOW,
    ...overrides,
  };
}

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * 86_400_000);
}

describe("shouldShowInstallPrompt", () => {
  it("shows for an onboarded athlete on a phone who has never answered", () => {
    expect(shouldShowInstallPrompt(eligible())).toBe(true);
    expect(shouldShowInstallPrompt(eligible({ platform: "android" }))).toBe(true);
  });

  it("stays away during onboarding, which has its own install step", () => {
    expect(shouldShowInstallPrompt(eligible({ onboardingDone: false }))).toBe(false);
  });

  it("stays away inside the installed app", () => {
    expect(shouldShowInstallPrompt(eligible({ standalone: true }))).toBe(false);
  });

  it("stays away on desktop", () => {
    expect(shouldShowInstallPrompt(eligible({ platform: "desktop" }))).toBe(false);
  });

  it("never returns after an install", () => {
    expect(
      shouldShowInstallPrompt(eligible({ pwaPromptState: "INSTALLED" })),
    ).toBe(false);
    // Even long after, and even with asks left on the counter.
    expect(
      shouldShowInstallPrompt(
        eligible({
          pwaPromptState: "INSTALLED",
          pwaPromptDismissedAt: daysAgo(400),
          pwaPromptShowCount: 0,
        }),
      ),
    ).toBe(false);
  });

  describe("after a dismissal", () => {
    it("is silent inside the cooldown", () => {
      expect(
        shouldShowInstallPrompt(
          eligible({
            pwaPromptState: "DISMISSED",
            pwaPromptDismissedAt: daysAgo(1),
            pwaPromptShowCount: 1,
          }),
        ),
      ).toBe(false);
    });

    // The boundary is exclusive: seven days to the second is not "more than
    // seven days ago", and the athlete gets the rest of that day in peace.
    it("is still silent exactly on the boundary", () => {
      expect(
        shouldShowInstallPrompt(
          eligible({
            pwaPromptState: "DISMISSED",
            pwaPromptDismissedAt: daysAgo(PWA_PROMPT_COOLDOWN_DAYS),
            pwaPromptShowCount: 1,
          }),
        ),
      ).toBe(false);
    });

    it("returns once past it", () => {
      expect(
        shouldShowInstallPrompt(
          eligible({
            pwaPromptState: "DISMISSED",
            pwaPromptDismissedAt: daysAgo(PWA_PROMPT_COOLDOWN_DAYS + 0.01),
            pwaPromptShowCount: 1,
          }),
        ),
      ).toBe(true);
    });

    it("gives up after the cap, however long it has been", () => {
      expect(
        shouldShowInstallPrompt(
          eligible({
            pwaPromptState: "DISMISSED",
            pwaPromptDismissedAt: daysAgo(365),
            pwaPromptShowCount: PWA_PROMPT_MAX_SHOWS,
          }),
        ),
      ).toBe(false);
    });

    it("allows the last ask at one below the cap", () => {
      expect(
        shouldShowInstallPrompt(
          eligible({
            pwaPromptState: "DISMISSED",
            pwaPromptDismissedAt: daysAgo(30),
            pwaPromptShowCount: PWA_PROMPT_MAX_SHOWS - 1,
          }),
        ),
      ).toBe(true);
    });

    // Both of these are corrupt states rather than expected ones, and both fail
    // toward silence. One fewer prompt costs little; one an athlete already
    // refused costs their attention for everything else PRform shows them.
    it("stays silent when the timestamp is missing", () => {
      expect(
        shouldShowInstallPrompt(
          eligible({ pwaPromptState: "DISMISSED", pwaPromptDismissedAt: null }),
        ),
      ).toBe(false);
    });

    it("stays silent when the timestamp is unparseable", () => {
      expect(
        shouldShowInstallPrompt(
          eligible({ pwaPromptState: "DISMISSED", pwaPromptDismissedAt: "not a date" }),
        ),
      ).toBe(false);
    });

    it("accepts an ISO string, which is what the API returns", () => {
      expect(
        shouldShowInstallPrompt(
          eligible({
            pwaPromptState: "DISMISSED",
            pwaPromptDismissedAt: daysAgo(10).toISOString(),
            pwaPromptShowCount: 1,
          }),
        ),
      ).toBe(true);
    });
  });
});
