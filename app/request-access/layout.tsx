import type { Metadata } from "next";
import { pageOpenGraph } from "@/lib/seo";

const description =
  "PRform is in invite-only early access for competitive distance runners. Request an invite and get your circadian sleep plan for the next race.";

// The page itself is a client component, so its metadata lives here.
export const metadata: Metadata = {
  title: "Request Early Access",
  description,
  alternates: { canonical: "/request-access" },
  openGraph: pageOpenGraph({
    url: "/request-access",
    title: "Request early access to PRform",
    description,
  }),
};

export default function RequestAccessLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
