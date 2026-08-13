"use client";

import { useCallback, useEffect, useState } from "react";
import {
  detectPlatform,
  installInstructions,
  pushAvailability,
  readEnvironment,
  urlBase64ToUint8Array,
  type Environment,
  type Platform,
  type PushAvailability,
} from "@/lib/pwa/install";
import { usePWAInstall } from "@/components/PWAInstallProvider";

// The whole notification enrolment story, in one hook: what this browser can
// do, what the server knows, and the two actions an athlete can take.
//
// Shared by the onboarding step and the dashboard notice so the two cannot
// drift — the second-worst outcome here is an athlete being told notifications
// are on in one place and off in another.

interface ServerStatus {
  publicKey: string | null;
  subscribed: boolean;
  installPromptDismissed: boolean;
  hasLoggedNight: boolean;
}

export interface PushEnrollment {
  /** Null until the browser has been read, which cannot happen during SSR. */
  environment: Environment | null;
  platform: Platform;
  availability: PushAvailability | null;
  /** The browser's current answer: "default" until asked. */
  permission: NotificationPermission | null;
  status: ServerStatus | null;
  loading: boolean;
  busy: boolean;
  error: string | null;
  /** True when Chrome has offered an install prompt we can trigger. */
  canPromptInstall: boolean;
  instructions: ReturnType<typeof installInstructions>;

  /** Ask the browser for permission, then subscribe and store it. */
  enable: () => Promise<boolean>;
  /** Trigger Chrome's own install dialog. iOS has none; see `instructions`. */
  promptInstall: () => Promise<void>;
  /** Record "not now" so the notice stops appearing on every device. */
  dismissInstall: () => Promise<void>;
  /** Send a real notification to this account's devices. */
  sendTest: () => Promise<boolean>;
  refresh: () => Promise<void>;
}

export function usePushEnrollment(): PushEnrollment {
  const [environment, setEnvironment] = useState<Environment | null>(null);
  const [permission, setPermission] = useState<NotificationPermission | null>(null);
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The install event is captured once, in PWAInstallProvider at the root of
  // the tree. This hook used to listen for beforeinstallprompt itself, which
  // was a race it usually lost: Chrome fires the event early, and a listener
  // that attaches when the profile page mounts is not there to catch it. Two
  // listeners also meant two answers to "can we install", which the dashboard
  // and the settings page could disagree about.
  const { canPromptNatively, installed, triggerInstall } = usePWAInstall();

  useEffect(() => {
    setEnvironment(readEnvironment());
    if (typeof window !== "undefined" && "Notification" in window) {
      setPermission(Notification.permission);
    }
  }, []);

  // Re-read the environment when the app is installed under us, so the notice
  // and the enrolment panel both notice they are now running standalone.
  useEffect(() => {
    if (installed) setEnvironment(readEnvironment());
  }, [installed]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/push/status");
      if (res.ok) setStatus(await res.json());
    } catch {
      // Offline, or signed out. Neither is worth an error message here — the
      // notice simply does not appear.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const enable = useCallback(async (): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      const env = readEnvironment();
      if (!env) return false;

      const availability = pushAvailability(env);
      if (availability.state !== "ready") {
        // The caller renders the explanation; this is the guard that stops a
        // permission request being fired where it cannot succeed.
        setError(
          availability.state === "needs_install"
            ? "Add PRform to your home screen first."
            : "This browser can't do notifications.",
        );
        return false;
      }

      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== "granted") {
        setError(
          result === "denied"
            ? "Notifications are blocked. You can turn them back on in your browser settings for this site."
            : null,
        );
        return false;
      }

      const registration = await navigator.serviceWorker.ready;

      // Reuse the existing subscription when there is one. Re-subscribing with
      // the same key returns the same endpoint anyway, but going through
      // getSubscription first avoids a needless round trip to the push service
      // on every visit.
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        const statusRes = await fetch("/api/push/status");
        const statusJson = (await statusRes.json()) as ServerStatus;
        if (!statusJson.publicKey) {
          setError("Notifications aren't configured on this server yet.");
          return false;
        }
        subscription = await registration.pushManager.subscribe({
          // Required by Chrome: every push must result in a visible
          // notification. The service worker honours that in every branch.
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(statusJson.publicKey),
        });
      }

      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscription: subscription.toJSON(),
          userAgent: env.userAgent,
          platform: detectPlatform(env.userAgent, env.maxTouchPoints),
          // The server needs this to compute the athlete's local evening, and
          // the browser is the only place it can come from for someone who
          // never enrolled in texts.
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      if (!res.ok) {
        setError("We couldn't save your notification settings. Try again.");
        return false;
      }

      await refresh();
      return true;
    } catch (e) {
      setError("Something went wrong turning notifications on.");
      return false;
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const promptInstall = useCallback(async () => {
    // The provider owns the event and its single-use lifecycle.
    await triggerInstall();
  }, [triggerInstall]);

  const dismissInstall = useCallback(async () => {
    setStatus((prev) => (prev ? { ...prev, installPromptDismissed: true } : prev));
    await fetch("/api/push/install-dismiss", { method: "POST" }).catch(() => {});
  }, []);

  const sendTest = useCallback(async (): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/push/test", { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "We couldn't send the test notification.");
        return false;
      }
      return true;
    } finally {
      setBusy(false);
    }
  }, []);

  const platform = environment
    ? detectPlatform(environment.userAgent, environment.maxTouchPoints)
    : "unknown";

  return {
    environment,
    platform,
    availability: environment ? pushAvailability(environment) : null,
    permission,
    status,
    loading,
    busy,
    error,
    canPromptInstall: canPromptNatively,
    instructions: installInstructions(platform),
    enable,
    promptInstall,
    dismissInstall,
    sendTest,
    refresh,
  };
}
