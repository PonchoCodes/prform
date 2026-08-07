"use client";

import { useState } from "react";
import { FadeUp } from "@/components/FadeUp";
import { PushEnrollment } from "@/components/PushEnrollment";
import { usePushEnrollment } from "@/hooks/usePushEnrollment";
import { shouldShowInstallNotice } from "@/lib/pwa/install";

// The notice that tells an existing user to install PRform.
//
// New accounts meet this as a step in onboarding. Everyone who signed up before
// it existed meets it here, on the dashboard, once — a strip they can act on or
// dismiss, and dismissing it records the choice on the account so it does not
// reappear on their other device.
//
// It waits until they have logged a night. Someone who has used PRform once has
// a reason to want it on their home screen; someone on their first visit is
// being asked for a favour by an app that has not done anything yet, and that
// prompt gets swatted rather than read. shouldShowInstallNotice holds that rule
// and lib/pwa/install.test.ts pins it.

export function InstallNotice() {
  const push = usePushEnrollment();
  const [expanded, setExpanded] = useState(false);

  if (push.loading || !push.environment || !push.status) return null;

  const visible = shouldShowInstallNotice({
    standalone: push.environment.standalone,
    subscribed: push.status.subscribed,
    dismissed: push.status.installPromptDismissed,
    hasLoggedNight: push.status.hasLoggedNight,
  });
  if (!visible) return null;

  // A browser that cannot do notifications at all still benefits from the app
  // being on the home screen, but the pitch would be a lie — the copy below
  // promises evening and morning messages. Better to say nothing.
  if (push.availability?.state === "unsupported") return null;

  if (expanded) {
    return (
      <FadeUp>
        <div className="mb-6">
          <PushEnrollment compact />
          <button
            type="button"
            onClick={() => {
              setExpanded(false);
              push.dismissInstall();
            }}
            className="mt-3 text-[10px] font-mono uppercase tracking-wider text-[#6B6B6B] dark:text-[#A0A0A0] hover:text-[#0A0A0A] dark:hover:text-[#F5F5F5] transition-colors"
          >
            Not now
          </button>
        </div>
      </FadeUp>
    );
  }

  return (
    <FadeUp>
      <div className="border border-[#0A0A0A] dark:border-[#F5F5F5] p-4 mb-6 flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] dark:text-[#A0A0A0] mb-1">
            Put PRform on your phone
          </p>
          <p className="text-sm leading-6">
            {push.platform === "ios"
              ? "Add PRform to your home screen and it can send your evening check-in and morning verdict, so you don't have to remember to open it."
              : "Install PRform and turn on notifications for your evening check-in and morning verdict, so you don't have to remember to open it."}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => push.dismissInstall()}
            className="text-[10px] font-bold uppercase tracking-wider text-[#6B6B6B] dark:text-[#A0A0A0] hover:text-[#0A0A0A] dark:hover:text-[#F5F5F5] transition-colors"
          >
            Not now
          </button>
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="text-[10px] font-bold uppercase tracking-wider border border-[#0A0A0A] dark:border-[#F5F5F5] bg-[#0A0A0A] dark:bg-[#F5F5F5] text-white dark:text-[#0A0A0A] px-4 py-2 hover:bg-transparent hover:text-[#0A0A0A] dark:hover:bg-transparent dark:hover:text-[#F5F5F5] transition-colors"
          >
            Show me how
          </button>
        </div>
      </div>
    </FadeUp>
  );
}
