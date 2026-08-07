"use client";

import { useState } from "react";
import { Button } from "@/components/Button";
import { usePushEnrollment } from "@/hooks/usePushEnrollment";
import { IOS_PUSH_EXPLANATION } from "@/lib/pwa/install";

// Installing PRform and turning on notifications, in one panel.
//
// Used in onboarding and inside the dashboard notice, so the wording an athlete
// sees is the same in both places.
//
// The iOS branch is the reason this component is more than a button. On iPhone
// and iPad, Apple allows web notifications only inside an installed app — in a
// Safari tab there is nothing to ask permission from, and a naive "Enable
// notifications" button would do nothing at all, with no error. So iOS is told
// what to do, in the exact words of the menu items, before it is offered
// anything to press.

const STEP_NUMBER =
  "shrink-0 w-6 h-6 border border-[#0A0A0A] dark:border-[#F5F5F5] flex items-center justify-center text-[10px] font-bold";

export function PushEnrollment({ compact = false }: { compact?: boolean }) {
  const push = usePushEnrollment();
  const [tested, setTested] = useState(false);

  if (push.loading || !push.environment || !push.availability) return null;

  const installed = push.environment.standalone;
  const subscribed = push.status?.subscribed ?? false;

  // ── Done ──────────────────────────────────────────────────────────────────
  if (subscribed && push.permission === "granted") {
    return (
      <div className="border border-[#E5E5E5] dark:border-[#333] p-5">
        <div className="flex items-start justify-between gap-4 mb-1">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] dark:text-[#A0A0A0]">
            Notifications
          </p>
          <span className="text-[10px] font-bold uppercase tracking-wider bg-[#E8FF00] text-[#0A0A0A] px-2 py-0.5">
            On
          </span>
        </div>
        <p className="text-sm font-mono text-[#6B6B6B] dark:text-[#A0A0A0] mb-4">
          {installed
            ? "You'll get your check-in each evening and your verdict each morning."
            : "On this browser. Add PRform to your home screen too and you'll get them when the browser is closed."}
        </p>
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            disabled={push.busy}
            onClick={async () => setTested(await push.sendTest())}
          >
            {push.busy ? "Sending…" : "Send a test"}
          </Button>
          {tested && (
            <span className="text-xs font-mono text-[#6B6B6B] dark:text-[#A0A0A0]">
              Sent. Check your lock screen.
            </span>
          )}
        </div>
        {push.error && <p className="text-xs font-mono text-[#FF4444] mt-3">{push.error}</p>}
      </div>
    );
  }

  // ── iOS, not yet installed: explain rather than fail silently ─────────────
  if (push.availability.state === "needs_install") {
    return (
      <div className="border-2 border-[#0A0A0A] dark:border-[#F5F5F5] p-5">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] dark:text-[#A0A0A0] mb-2">
          One step first
        </p>
        <h3 className="font-black text-lg uppercase mb-2">
          {push.instructions?.headline ?? "Add PRform to your home screen"}
        </h3>
        <p className="text-sm font-mono text-[#6B6B6B] dark:text-[#A0A0A0] mb-5">
          {IOS_PUSH_EXPLANATION}
        </p>
        <ol className="space-y-3 mb-2">
          {(push.instructions?.steps ?? []).map((step, i) => (
            <li key={i} className="flex gap-3 items-start">
              <span className={STEP_NUMBER}>{i + 1}</span>
              <span className="text-sm leading-6">{step}</span>
            </li>
          ))}
        </ol>
        <p className="text-[10px] font-mono text-[#6B6B6B] dark:text-[#A0A0A0] mt-4">
          Open PRform from the home screen and this panel will offer to turn notifications on.
        </p>
      </div>
    );
  }

  // ── This browser genuinely cannot ─────────────────────────────────────────
  if (push.availability.state === "unsupported") {
    return (
      <div className="border border-[#E5E5E5] dark:border-[#333] p-5">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] dark:text-[#A0A0A0] mb-2">
          Notifications
        </p>
        <p className="text-sm font-mono text-[#6B6B6B] dark:text-[#A0A0A0]">
          This browser can&apos;t receive notifications. Open the app to see your plan.
        </p>
      </div>
    );
  }

  // ── Blocked at the browser level ──────────────────────────────────────────
  if (push.permission === "denied") {
    return (
      <div className="border border-[#E5E5E5] dark:border-[#333] p-5">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] dark:text-[#A0A0A0] mb-2">
          Notifications blocked
        </p>
        <p className="text-sm font-mono text-[#6B6B6B] dark:text-[#A0A0A0]">
          Notifications are turned off for PRform in your browser settings. Allow them for this
          site, then come back.
        </p>
      </div>
    );
  }

  // ── Ready to ask ──────────────────────────────────────────────────────────
  return (
    <div className="border border-[#E5E5E5] dark:border-[#333] p-5">
      <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] dark:text-[#A0A0A0] mb-2">
        Notifications
      </p>
      {!compact && (
        <h3 className="font-black text-lg uppercase mb-2">Two taps a day, no tabs</h3>
      )}
      <p className="text-sm font-mono text-[#6B6B6B] dark:text-[#A0A0A0] mb-5">
        One check-in each evening with tonight&apos;s bedtime, and one verdict each morning.
      </p>

      <div className="flex flex-wrap gap-3">
        <Button variant="primary" size="sm" onClick={push.enable} disabled={push.busy}>
          {push.busy ? "Just a second…" : "Turn on notifications"}
        </Button>
        {/* Chrome only hands us an install prompt when the app is installable
            and not already installed. On iOS this is never present, which is
            what the branch above is for. */}
        {push.canPromptInstall && !installed && (
          <Button variant="secondary" size="sm" onClick={push.promptInstall}>
            Install the app
          </Button>
        )}
      </div>

      {push.error && <p className="text-xs font-mono text-[#FF4444] mt-3">{push.error}</p>}

      {!installed && !push.canPromptInstall && push.instructions && (
        <p className="text-[10px] font-mono text-[#6B6B6B] dark:text-[#A0A0A0] mt-4">
          Tip: {push.instructions.steps[0]}
        </p>
      )}
    </div>
  );
}
