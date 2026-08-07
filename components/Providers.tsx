"use client";
import { SessionProvider } from "next-auth/react";
import { ServiceWorkerRegistrar } from "@/components/ServiceWorkerRegistrar";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      {/* Renders nothing. Mounted here so the worker registers on every page
          rather than only the ones somebody remembered to add it to. */}
      <ServiceWorkerRegistrar />
      {children}
    </SessionProvider>
  );
}
