import {
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TAGLINE,
  SITE_URL,
  ATHLETE_PRICE_USD,
  absoluteUrl,
} from "@/lib/seo";

/**
 * JSON-LD for the landing page: Organization + WebSite + SoftwareApplication
 * in one @graph so the three nodes reference each other by @id.
 *
 * Everything asserted here has to be true on the page. An athlete account is
 * free, which is what the offer below says; there is no aggregateRating because
 * there are no published reviews to back one.
 */
export function homePageJsonLd() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        name: SITE_NAME,
        url: SITE_URL,
        // Profiles that verifiably belong to this project. A sameAs pointing at
        // a page that doesn't exist is a false assertion about identity, which
        // is the one thing entity resolution can't recover from: so a profile
        // goes in here only once it's live and public.
        sameAs: ["https://github.com/PonchoCodes/prform"],
        logo: absoluteUrl("/apple-icon"),
        slogan: SITE_TAGLINE,
        description: SITE_DESCRIPTION,
        founder: { "@id": `${SITE_URL}/#founder` },
      },
      {
        // The founder's own profiles, deliberately not folded into the
        // Organization's sameAs above: that array identifies the project, this
        // one identifies a person, and merging them would assert to a crawler
        // that the human and the software are the same entity.
        "@type": "Person",
        "@id": `${SITE_URL}/#founder`,
        name: "Alfonso Gonzalez-Cano",
        sameAs: [
          "https://www.linkedin.com/in/alfonso-gonzalez-cano-0755832a1/",
          "https://github.com/PonchoCodes",
        ],
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        name: SITE_NAME,
        url: SITE_URL,
        description: SITE_DESCRIPTION,
        inLanguage: "en-US",
        publisher: { "@id": `${SITE_URL}/#organization` },
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${SITE_URL}/#software`,
        name: SITE_NAME,
        url: SITE_URL,
        applicationCategory: "HealthApplication",
        applicationSubCategory: "Sleep and training optimization",
        operatingSystem: "Web browser",
        description: SITE_DESCRIPTION,
        publisher: { "@id": `${SITE_URL}/#organization` },
        audience: {
          "@type": "Audience",
          audienceType: "Competitive distance runners",
        },
        featureList: [
          "Circadian phase-advance protocol timed to race day",
          "Nightly bedtime target from a 14-day adaptive sleep plan",
          "Time-stamped 3-hour wind-down countdown",
          "Per-race taper curves for A, B, and C priority meets",
          "VDOT-based training paces and sleep-pace correlation tracking",
          "Team rosters with a weekly check-in leaderboard",
        ],
        offers: {
          "@type": "Offer",
          price: ATHLETE_PRICE_USD,
          priceCurrency: "USD",
          category: "free",
          availability: "https://schema.org/InStock",
        },
      },
    ],
  };
}
