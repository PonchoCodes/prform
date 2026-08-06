"use client";

import { useEffect, useState } from "react";

const DISMISS_KEY = "prform-subscribe-dismissed";

/**
 * A one-line trial prompt, below the verdict rather than above it.
 *
 * As a full-bleed lime block at the top of the page it took roughly a third of
 * the fold on a phone, displacing the thing that actually earns a return visit.
 * Dismissal persists — the same localStorage convention the dismissed-day cards
 * and the intervention card already use.
 */
export function SubscribeStrip() {
  const [dismissed, setDismissed] = useState(true);

  // Read after mount: localStorage is unavailable during SSR, and defaulting to
  // dismissed means the strip fades in rather than flashing and disappearing.
  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  if (dismissed) return null;

  return (
    <div className="border-b border-[#E5E5E5] dark:border-[#333] px-6">
      <div className="max-w-[1200px] mx-auto flex items-center gap-4 py-2">
        <p className="font-mono text-[11px] text-[#6B6B6B] dark:text-[#A0A0A0] flex-1 min-w-0">
          <a
            href="/subscribe"
            className="font-bold text-[#0A0A0A] dark:text-[#F5F5F5] border-b border-[#E8FF00] hover:bg-[#E8FF00] hover:text-[#0A0A0A] transition-colors"
          >
            Start your 30-day free trial
          </a>{" "}
          to unlock PRform.
        </p>
        <button
          onClick={() => {
            try {
              localStorage.setItem(DISMISS_KEY, "1");
            } catch {}
            setDismissed(true);
          }}
          aria-label="Dismiss trial prompt"
          className="shrink-0 inline-flex items-center justify-center min-w-[44px] min-h-[44px] text-[#6B6B6B] hover:text-[#0A0A0A] dark:hover:text-[#F5F5F5] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E8FF00]"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
