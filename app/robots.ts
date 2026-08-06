import type { MetadataRoute } from "next";
import { SITE_URL, absoluteUrl } from "@/lib/seo";

/**
 * Everything behind auth is disallowed. Those routes redirect to /login for a
 * crawler anyway, so letting bots walk them only burns crawl budget on
 * near-duplicate login shells.
 *
 * Disallow entries are prefix matches, so "/sleep" also covers /sleep-history.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/admin",
          "/analysis",
          "/dashboard",
          "/meets",
          "/onboarding",
          "/profile",
          "/schedule",
          "/sleep",
          "/strava",
          "/subscribe",
        ],
      },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
    host: SITE_URL,
  };
}
