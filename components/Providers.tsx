"use client";
import { SessionProvider } from "next-auth/react";
import { ServiceWorkerRegistrar } from "@/components/ServiceWorkerRegistrar";
import { PWAInstallProvider } from "@/components/PWAInstallProvider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      {/* Renders nothing. Mounted here so the worker registers on every page
          rather than only the ones somebody remembered to add it to. */}
      <ServiceWorkerRegistrar />
      {/* Also renders nothing, and also has to be this high up: Chrome fires
          beforeinstallprompt once, early, and a listener attached by the modal
          that eventually wants it would be attached seconds too late. */}
      <PWAInstallProvider>{children}</PWAInstallProvider>
    </SessionProvider>
  );
}
