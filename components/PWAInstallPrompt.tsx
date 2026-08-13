"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { PWAInstallInstructions } from "@/components/PWAInstallInstructions";
import { getPlatform, isStandalone } from "@/lib/pwaDetect";
import { shouldShowInstallPrompt, type PwaPromptState } from "@/lib/pwaPrompt";
import { EVENING_LEAD_MINUTES } from "@/lib/messaging/config";
import { formatTime12h } from "@/lib/sleepAlgorithm";

// The triggered half of the install story. The settings page is where somebody
// goes looking for this; the modal is where it goes looking for them.
//
// It opens with the athlete's own bedtime in the headline, which is why it is
// fired by the dashboard after the daily plan resolves rather than on login. A
// generic "install our app" is a banner people have learned to dismiss without
// reading. "Your bedtime tonight is 10:47 PM, install PRform to get reminded at
// 9:17 PM" is the same ask attached to the thing they came here for, and it can
// only be written once the plan exists.
//
// Two deliberate non-behaviours:
//
//   It does not block. Escape closes it, the backdrop closes it, and closing it
//   is not a dismissal — the dashboard behind it is fully usable, and an
//   athlete who opened PRform to log last night gets to do that.
//
//   It does not delay. No timer holds it back once the plan has loaded. A modal
//   that appears four seconds in lands after the reader has started reading,
//   which is how a prompt gets swatted rather than read.

interface PWAInstallPromptProps {
  /** Tonight's recommended bedtime, "HH:MM" 24h. The trigger condition. */
  bedtime: string | null | undefined;
  /** From the session. The modal stays away until setup is finished. */
  onboardingDone: boolean;
  /** The three columns, as returned by /api/push/status. Null while loading. */
  promptState: PwaPromptState | null;
  /**
   * Fired once, if and when this modal opens, so the dashboard can stand the
   * InstallNotice strip down for the rest of the page load. The two ask for the
   * same thing, and an athlete who sees both is being nagged by an app that has
   * lost track of what it already asked.
   *
   * Deliberately not paired with a close callback: bringing the strip back the
   * instant somebody taps "Not now" is the same nag with an extra step.
   */
  onShown?: () => void;
}

/** Bedtime minus the evening check-in's lead, wrapped over midnight. */
function reminderClock(bedtime: string): string | null {
  const [h, m] = bedtime.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  const minutes = (((h * 60 + m - EVENING_LEAD_MINUTES) % 1440) + 1440) % 1440;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export function PWAInstallPrompt({
  bedtime,
  onboardingDone,
  promptState,
  onShown,
}: PWAInstallPromptProps) {
  const shouldReduceMotion = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  /** Once per page load. Re-opening on every plan refetch would be a loop. */
  const decidedRef = useRef(false);

  useEffect(() => {
    if (decidedRef.current) return;
    // The trigger: a loaded plan with a real bedtime in it. Both halves matter
    // — the account state alone would open this over a spinner.
    if (!bedtime || !promptState) return;

    decidedRef.current = true;
    const eligible = shouldShowInstallPrompt({
      ...promptState,
      onboardingDone,
      standalone: isStandalone(),
      platform: getPlatform(),
    });
    setOpen(eligible);
    if (eligible) onShown?.();
  }, [bedtime, promptState, onboardingDone, onShown]);

  // Escape closes, and focus goes into the dialog and back out again. Same
  // contract as DayDetailModal — a dialog that traps focus without returning it
  // strands a keyboard user on the page behind it.
  useEffect(() => {
    if (!open) return;
    triggerRef.current = document.activeElement as HTMLElement;
    const focusable = dialogRef.current?.querySelector<HTMLElement>(
      "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
    );
    focusable?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      triggerRef.current?.focus();
    };
  }, [open]);

  if (!open || !bedtime) return null;

  const reminder = reminderClock(bedtime);

  const close = () => setOpen(false);

  const dismiss = async () => {
    setDismissing(true);
    setOpen(false);
    // Not awaited before closing. The modal shutting is the athlete's answer to
    // their own tap; making them watch a spinner for our bookkeeping would be
    // the wrong way round.
    try {
      await fetch("/api/user/pwa-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dismissed" }),
      });
    } catch {
      // Offline. It reappears next time, which is the tolerable direction to
      // fail: the alternative is losing the record of an install they made.
    } finally {
      setDismissing(false);
    }
  };

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-[2px] z-50 flex items-end sm:items-center justify-center"
        onClick={close}
      >
        <motion.div
          ref={dialogRef}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ duration: shouldReduceMotion ? 0 : 0.25 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-prompt-title"
          className="bg-white dark:bg-[#242424] border border-[#E5E5E5] dark:border-[#333] max-w-[480px] w-full sm:mx-4 max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-[#E5E5E5] dark:border-[#333]">
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] dark:text-[#A0A0A0] pt-1">
              Tonight
            </p>
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              className="w-8 h-8 shrink-0 flex items-center justify-center border border-[#E5E5E5] dark:border-[#333] text-[#6B6B6B] dark:text-[#A0A0A0] hover:border-[#0A0A0A] dark:hover:border-[#F5F5F5] transition-colors font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E8FF00]"
            >
              ×
            </button>
          </div>

          <div className="px-6 py-5 border-b border-[#E5E5E5] dark:border-[#333]">
            <h3 id="pwa-prompt-title" className="font-black text-xl uppercase leading-tight mb-3">
              Your bedtime tonight is{" "}
              <span className="font-mono">{formatTime12h(bedtime)}</span>
            </h3>
            <p className="text-sm leading-6 text-[#6B6B6B] dark:text-[#A0A0A0]">
              {reminder
                ? `Add PRform to your home screen and it will remind you at ${formatTime12h(reminder)}, so you don't have to remember to open it.`
                : "Add PRform to your home screen and it will remind you before lights out, so you don't have to remember to open it."}
            </p>
          </div>

          <div className="px-6 py-5">
            <PWAInstallInstructions variant="modal" onInstalled={close} />
          </div>

          <div className="px-6 pb-5">
            <button
              type="button"
              onClick={dismiss}
              disabled={dismissing}
              className="text-[10px] font-bold uppercase tracking-wider text-[#6B6B6B] dark:text-[#A0A0A0] hover:text-[#0A0A0A] dark:hover:text-[#F5F5F5] transition-colors disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E8FF00]"
            >
              Not now
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
