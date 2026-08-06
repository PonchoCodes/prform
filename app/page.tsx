import type { Metadata } from "next";
import { LandingPage } from "@/components/LandingPage";
import { isEarlyAccessEnabled } from "@/lib/earlyAccess";
import { pageOpenGraph } from "@/lib/seo";
import { homePageJsonLd } from "@/lib/structuredData";

// Read the EARLY_ACCESS flag at request time, not at build time.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
  openGraph: pageOpenGraph({ url: "/" }),
};

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(homePageJsonLd()) }}
      />
      <LandingPage earlyAccess={isEarlyAccessEnabled()} />
    </>
  );
}
