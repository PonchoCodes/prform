"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/Button";
import { usePWAInstall } from "@/components/PWAInstallProvider";
import { getInstallContext, isIosSafari, type InstallContext } from "@/lib/pwaDetect";

// How this particular person installs PRform, in one component used by both
// entry points: the settings page, where they came looking for it, and the
// triggered modal, which came looking for them.
//
// Shared because the two used to be able to disagree. Instructions that live in
// two places drift, and the failure is silent — the settings page keeps naming
// a menu item Safari renamed two releases ago while the modal is correct, and
// nobody notices because nobody reads both on the same phone.
//
// Every branch below is a real dead end somebody hits:
//
//   In-app browser  — Instagram's webview has no Add to Home Screen at all.
//   iOS Safari      — no install prompt exists; the Share sheet is the only route.
//   Android + event — Chrome will show its own dialog, so show a button.
//   Android, no event — the event never came; name the menu items instead.
//   Desktop         — installable, but the thing it promises is a phone thing.

interface PWAInstallInstructionsProps {
  variant: "modal" | "settings";
  /** Called once the native dialog reports an accepted install. */
  onInstalled?: () => void;
}

const LABEL = "text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] dark:text-[#A0A0A0]";
const BODY = "text-sm leading-6 text-[#0A0A0A] dark:text-[#F5F5F5]";
const MUTED = "text-sm font-mono text-[#6B6B6B] dark:text-[#A0A0A0]";
const STEP_NUMBER =
  "shrink-0 w-6 h-6 border border-[#0A0A0A] dark:border-[#F5F5F5] flex items-center justify-center text-[10px] font-bold";

/**
 * The iOS share glyph, drawn rather than named.
 *
 * Inline SVG and not an emoji: the emoji that looks like this on a Mac is a
 * different picture on the iPhone the instructions are being read on, and the
 * whole point of the step is "find the button that looks like this".
 */
function ShareGlyph({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      className={`inline-block w-[1em] h-[1em] align-[-0.15em] ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* The tray */}
      <path d="M7 10.5H5.6A1.6 1.6 0 0 0 4 12.1v7.3A1.6 1.6 0 0 0 5.6 21h12.8a1.6 1.6 0 0 0 1.6-1.6v-7.3a1.6 1.6 0 0 0-1.6-1.6H17" />
      {/* The arrow */}
      <path d="M12 3v12" />
      <path d="M8.2 6.6 12 2.9l3.8 3.7" />
    </svg>
  );
}

/** The current URL, copied so it can be pasted into a real browser. */
function CopyUrlButton() {
  const [copied, setCopied] = useState(false);
  const [url, setUrl] = useState("");

  useEffect(() => {
    setUrl(window.location.href);
  }, []);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2500);
    return () => clearTimeout(t);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url || window.location.href);
      setCopied(true);
    } catch {
      // Some webviews refuse clipboard access outright. The address is on
      // screen below either way, which is why it is rendered and not hidden
      // behind the button.
      setCopied(false);
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={copy}
        className="w-full border border-[#0A0A0A] dark:border-[#F5F5F5] px-4 py-3 text-left transition-colors hover:bg-[#0A0A0A] hover:text-white dark:hover:bg-[#F5F5F5] dark:hover:text-[#0A0A0A] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E8FF00]"
      >
        <span className="block text-[10px] font-bold uppercase tracking-wider mb-1">
          {copied ? "Copied" : "Tap to copy the address"}
        </span>
        <span className="block text-xs font-mono break-all">{url}</span>
      </button>
    </div>
  );
}

export function PWAInstallInstructions({ variant, onInstalled }: PWAInstallInstructionsProps) {
  const { canPromptNatively, triggerInstall } = usePWAInstall();

  // Detection reads the browser, so it cannot run during SSR and cannot run in
  // the first render pass either — doing it there produces markup that differs
  // from the server's and React throws away the tree. Null until mounted.
  const [context, setContext] = useState<(InstallContext & { iosSafari: boolean }) | null>(
    null,
  );

  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // canPromptNatively is read from the context object for completeness, but
    // the branches below use the provider's live `canPromptNatively` instead:
    // this snapshot is taken on mount, and Chrome's event routinely arrives
    // after it. A component that trusted the snapshot would show manual steps
    // to somebody who was about to be offered a button.
    setContext({ ...getInstallContext(), iosSafari: isIosSafari() });
  }, []);

  if (!context) return null;

  const settings = variant === "settings";

  // ── Already installed ─────────────────────────────────────────────────────
  // The settings page is reachable from inside the installed app, so it needs
  // something true to say there. The modal never renders in this state, but the
  // branch is here rather than only in the caller so the component cannot be
  // dropped somewhere new and start giving install steps to an installed app.
  if (context.standalone) {
    return (
      <div className="border border-[#E5E5E5] dark:border-[#333] p-5">
        <div className="flex items-start justify-between gap-4 mb-1">
          <p className={LABEL}>Home screen</p>
          <span className="text-[10px] font-bold uppercase tracking-wider bg-[#E8FF00] text-[#0A0A0A] px-2 py-0.5">
            On
          </span>
        </div>
        <p className={`${MUTED} mt-2`}>PRform is installed.</p>
      </div>
    );
  }

  const container = settings
    ? "border border-[#E5E5E5] dark:border-[#333] p-5"
    : "";

  // ── In an app's webview, or a non-Safari browser on iOS ───────────────────
  //
  // Both cases have the same shape: the athlete is in a browser that cannot do
  // this, and the only useful instruction is how to get out of it. Install
  // steps are deliberately withheld — describing the Share sheet to somebody
  // whose screen has no Share sheet reads as PRform being broken.
  const needsRealBrowser =
    context.inAppBrowser || (context.platform === "ios" && !context.iosSafari);

  if (needsRealBrowser) {
    const targetBrowser = context.platform === "android" ? "Chrome" : "Safari";
    return (
      <div className={container}>
        <p className={`${LABEL} mb-2`}>One step first</p>
        <h3 className="font-black text-lg uppercase mb-2">
          Open in {targetBrowser} first
        </h3>
        <p className={`${BODY} mb-4`}>
          {context.inAppBrowser
            ? `This page is open inside another app, and Add to Home Screen is not available here. Copy the address and open it in ${targetBrowser}, then come back to this screen.`
            : `Add to Home Screen is a ${targetBrowser} feature. Copy the address and open it in ${targetBrowser}, then come back to this screen.`}
        </p>
        <CopyUrlButton />
      </div>
    );
  }

  // ── iOS Safari: the Share sheet is the only route ─────────────────────────
  if (context.platform === "ios") {
    return (
      <div className={container}>
        <p className={`${LABEL} mb-2`}>Add to home screen</p>
        {!settings && (
          <h3 className="font-black text-lg uppercase mb-3">Three taps</h3>
        )}
        <ol className="space-y-3">
          <li className="flex gap-3 items-start">
            <span className={STEP_NUMBER}>1</span>
            <span className={BODY}>
              Tap the Share button <ShareGlyph className="mx-0.5" /> in Safari&apos;s toolbar.
            </span>
          </li>
          <li className="flex gap-3 items-start">
            <span className={STEP_NUMBER}>2</span>
            <span className={BODY}>Scroll down and tap Add to Home Screen.</span>
          </li>
          <li className="flex gap-3 items-start">
            <span className={STEP_NUMBER}>3</span>
            <span className={BODY}>Tap Add, then open PRform from your home screen.</span>
          </li>
        </ol>
        <p className={`${MUTED} mt-4 text-xs`}>
          On iPhone, notifications only work after this step.
        </p>
      </div>
    );
  }

  // ── Android, with Chrome's event in hand ──────────────────────────────────
  if (context.platform === "android" && canPromptNatively) {
    return (
      <div className={container}>
        <p className={`${LABEL} mb-2`}>Add to home screen</p>
        <p className={`${BODY} mb-4`}>
          PRform installs like any other app and opens from your home screen.
        </p>
        <Button
          variant="primary"
          size="md"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const outcome = await triggerInstall();
              if (outcome === "accepted") onInstalled?.();
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Just a second…" : "Install PRform"}
        </Button>
      </div>
    );
  }

  // ── Android, without it ───────────────────────────────────────────────────
  //
  // Chrome withholds the event for reasons it does not report: already
  // installed on another profile, engagement heuristics, a manifest it did not
  // like this load. Naming the menu items works regardless of which it was.
  if (context.platform === "android") {
    return (
      <div className={container}>
        <p className={`${LABEL} mb-2`}>Add to home screen</p>
        <ol className="space-y-3">
          <li className="flex gap-3 items-start">
            <span className={STEP_NUMBER}>1</span>
            <span className={BODY}>Open your browser&apos;s menu.</span>
          </li>
          <li className="flex gap-3 items-start">
            <span className={STEP_NUMBER}>2</span>
            <span className={BODY}>Tap Install app, or Add to Home screen.</span>
          </li>
          <li className="flex gap-3 items-start">
            <span className={STEP_NUMBER}>3</span>
            <span className={BODY}>Confirm, then open PRform from your home screen.</span>
          </li>
        </ol>
      </div>
    );
  }

  // ── Desktop ───────────────────────────────────────────────────────────────
  return (
    <div className={container}>
      <p className={`${LABEL} mb-2`}>On your phone</p>
      <p className={BODY}>
        PRform is built for a phone. Open{" "}
        <a
          href="https://prform.app"
          className="underline underline-offset-2 hover:text-[#6B6B6B] dark:hover:text-[#A0A0A0]"
        >
          prform.app
        </a>{" "}
        on yours to add it to your home screen.
      </p>
    </div>
  );
}
