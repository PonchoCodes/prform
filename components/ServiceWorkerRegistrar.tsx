"use client";

import { useEffect } from "react";

// Registers the service worker, and keeps the stored subscription fresh.
//
// Mounted once, in Providers, so it runs on every page rather than only where
// someone remembered to add it. Renders nothing.

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    // Registering during load contends with the page's own requests for
    // bandwidth on a phone, and nothing here is needed for the first paint.
    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });

        // A subscription can be revoked by the browser without telling the
        // server — a wiped phone, a pruned endpoint, a reinstalled PWA. Every
        // load, we re-post whatever the browser currently holds, which
        // refreshes lastSeenAt and repairs the row if the endpoint changed
        // while nothing was open to notice.
        const subscription = await registration.pushManager?.getSubscription();
        if (subscription) {
          await fetch("/api/push/subscribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              subscription: subscription.toJSON(),
              userAgent: navigator.userAgent,
              timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            }),
          }).catch(() => {
            // Signed out, or offline. Both are normal; the next load retries.
          });
        }
      } catch {
        // A failed registration must never break the page. The app works
        // without a service worker — it just does not work offline, and cannot
        // receive notifications.
      }
    };

    if (document.readyState === "complete") {
      register();
      return;
    }
    window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
