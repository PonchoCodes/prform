import type { Metadata } from "next";
import { LandingPage } from "@/components/LandingPage";
import { pageOpenGraph } from "@/lib/seo";
import { homePageJsonLd } from "@/lib/structuredData";

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
      <LandingPage />
    </>
  );
}
