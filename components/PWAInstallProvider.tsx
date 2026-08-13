"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { setNativePromptAvailable } from "@/lib/pwaDetect";

// The one place beforeinstallprompt is captured.
//
// Chrome fires this event once, early, and only when the app is installable. If
// nothing calls preventDefault() on it during that tick the chance is gone for
// the rest of the page's life — so the listener has to already be attached
// before any component that wants to offer an install button has mounted. That
// is the whole reason this sits in the root layout rather than inside the modal
// that uses it: the modal only appears after the daily plan has loaded, which
// is several seconds and one fetch too late.
//
// The event is held in a ref rather than state because it is not render data —
// it is a handle we hold and later spend. What renders is `canPromptNatively`,
// a boolean shadow of it kept in state, so a component that mounts after the
// event arrived still re-renders when it does.

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface PWAInstallContextValue {
  /** True while a captured event is available to spend. */
  canPromptNatively: boolean;
  /** True once this page has seen an appinstalled event. */
  installed: boolean;
  /**
   * Show Chrome's own install dialog. Resolves to the athlete's answer, or
   * null when there was no event to spend — the caller renders manual steps in
   * that case rather than a button that does nothing.
   */
  triggerInstall: () => Promise<"accepted" | "dismissed" | null>;
}

const PWAInstallContext = createContext<PWAInstallContextValue>({
  canPromptNatively: false,
  installed: false,
  triggerInstall: async () => null,
});

export function usePWAInstall(): PWAInstallContextValue {
  return useContext(PWAInstallContext);
}

/** Records the outcome on the account. Fire-and-forget by design. */
async function postPromptState(action: "dismissed" | "installed"): Promise<void> {
  try {
    await fetch("/api/user/pwa-prompt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
  } catch {
    // Signed out, offline, or the request raced a navigation. None of these are
    // worth surfacing: the athlete has already installed the app, which is the
    // outcome we wanted, and the modal's other conditions keep it away anyway.
  }
}

export function PWAInstallProvider({ children }: { children: React.ReactNode }) {
  const eventRef = useRef<BeforeInstallPromptEvent | null>(null);
  const [canPromptNatively, setCanPrompt] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const onBeforeInstallPrompt = (e: Event) => {
      // Required. Without it Chrome shows its own mini-infobar and the event is
      // never ours to trigger from a button of our own.
      e.preventDefault();
      eventRef.current = e as BeforeInstallPromptEvent;
      setCanPrompt(true);
      setNativePromptAvailable(true);
    };

    const onInstalled = () => {
      // The captured event is single-use and now stale.
      eventRef.current = null;
      setCanPrompt(false);
      setNativePromptAvailable(false);
      setInstalled(true);
      // Recorded on the account so the modal does not reappear on this
      // athlete's other devices, where the browser has no idea they installed
      // it on their phone.
      void postPromptState("installed");
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const triggerInstall = useCallback(async (): Promise<
    "accepted" | "dismissed" | null
  > => {
    const event = eventRef.current;
    if (!event) return null;

    await event.prompt();
    const { outcome } = await event.userChoice;

    // Spent either way: Chrome refuses to show the same event twice. Dropping
    // it here rather than only on "accepted" is what stops a second tap on the
    // button doing nothing visible.
    eventRef.current = null;
    setCanPrompt(false);
    setNativePromptAvailable(false);

    // "accepted" is not recorded here. The appinstalled listener above is the
    // signal that the install actually happened — accepting the dialog and then
    // failing is rare, but writing INSTALLED for it would permanently silence a
    // prompt for someone who has no app.
    return outcome;
  }, []);

  return (
    <PWAInstallContext.Provider value={{ canPromptNatively, installed, triggerInstall }}>
      {children}
    </PWAInstallContext.Provider>
  );
}
