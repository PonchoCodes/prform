import type { Metadata } from "next";

// The page itself is a client component, so its metadata lives here.
export const metadata: Metadata = {
  title: "Log In",
  description: "Log in to PRform to see tonight's sleep target and your wind-down countdown.",
  // Thin, duplicate-prone auth page with nothing to rank for. Still followed so
  // link equity passes through to the marketing pages.
  robots: { index: false, follow: true },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
