// Whether the triggered install modal is allowed to open, as one pure function
// over a snapshot of the account and the browser.
//
// Pure for the same reason shouldShowInstallNotice is: the cases that matter
// are a dismissal six days old versus eight days old, on an iPhone, for an
// account that finished onboarding — combinations nobody is going to reproduce
// by hand on a device, and every one of which is a line in pwaPrompt.test.ts.

import type { InstallPlatform } from "@/lib/pwaDetect";

/** Days before a "not now" stops silencing the modal. */
export const PWA_PROMPT_COOLDOWN_DAYS = 7;

/**
 * How many times an athlete may be asked in total.
 *
 * The counter increments on dismissal, not on render, so this is really a cap
 * on refusals: three "not now"s is an answer, and a fourth ask is nagging
 * somebody who has been clear.
 */
export const PWA_PROMPT_MAX_SHOWS = 3;

export interface PwaPromptState {
  /** null = never answered. "DISMISSED" and "INSTALLED" are terminal answers. */
  pwaPromptState: string | null;
  pwaPromptDismissedAt: Date | string | null;
  pwaPromptShowCount: number;
}

export interface PwaPromptInput extends PwaPromptState {
  onboardingDone: boolean;
  standalone: boolean;
  platform: InstallPlatform;
  /** Now, injected so a test can sit either side of the cooldown. */
  now?: Date;
}

export function shouldShowInstallPrompt(input: PwaPromptInput): boolean {
  // Onboarding has its own install step. Opening this on top of it asks the
  // same question twice on the same screen.
  if (!input.onboardingDone) return false;

  // Already on the home screen. There is nothing left to ask for, and this is
  // the check that keeps the modal out of the installed app itself.
  if (input.standalone) return false;

  // Desktop browsers can install PRform, but the product is a phone product and
  // the notifications it promises are phone notifications. See the desktop
  // branch of PWAInstallInstructions, which says so rather than showing steps.
  if (input.platform === "desktop") return false;

  if (input.pwaPromptState === "INSTALLED") return false;

  if (input.pwaPromptState === "DISMISSED") {
    if (input.pwaPromptShowCount >= PWA_PROMPT_MAX_SHOWS) return false;
    if (!input.pwaPromptDismissedAt) return false;

    const dismissedAt = new Date(input.pwaPromptDismissedAt);
    // An unparseable timestamp is treated as "recently dismissed". Failing
    // toward silence is right for a modal: the cost of one fewer prompt is
    // small, and the cost of one an athlete has already refused is that they
    // stop reading anything PRform puts in front of them.
    if (Number.isNaN(dismissedAt.getTime())) return false;

    const elapsedDays =
      ((input.now ?? new Date()).getTime() - dismissedAt.getTime()) / 86_400_000;
    if (elapsedDays <= PWA_PROMPT_COOLDOWN_DAYS) return false;
  }

  return true;
}
