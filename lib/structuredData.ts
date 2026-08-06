import {
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TAGLINE,
  SITE_URL,
  SUBSCRIPTION_PRICE_USD,
  absoluteUrl,
} from "@/lib/seo";

/**
 * JSON-LD for the landing page: Organization + WebSite + SoftwareApplication
 * in one @graph so the three nodes reference each other by @id.
 *
 * Everything asserted here has to be true on the page. The price and trial
 * length mirror /subscribe; there is no aggregateRating because there are no
 * published reviews to back one.
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
        logo: absoluteUrl("/apple-icon"),
        slogan: SITE_TAGLINE,
        description: SITE_DESCRIPTION,
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
          "Strava auto-sync",
        ],
        offers: {
          "@type": "Offer",
          price: SUBSCRIPTION_PRICE_USD,
          priceCurrency: "USD",
          category: "subscription",
          priceSpecification: {
            "@type": "UnitPriceSpecification",
            price: SUBSCRIPTION_PRICE_USD,
            priceCurrency: "USD",
            referenceQuantity: {
              "@type": "QuantitativeValue",
              value: 1,
              unitCode: "MON",
            },
          },
        },
      },
    ],
  };
}
