import type { Metadata } from "next";
import { pageOpenGraph } from "@/lib/seo";

const description =
  "Start your PRform account and get a nightly sleep target built around your race calendar. 30 days free.";

// The page itself is a client component, so its metadata lives here.
export const metadata: Metadata = {
  title: "Create Account",
  description,
  alternates: { canonical: "/signup" },
  openGraph: pageOpenGraph({
    url: "/signup",
    title: "Create your PRform account",
    description,
  }),
};

export default function SignUpLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
