import type { MetadataRoute } from "next";
import { isEarlyAccessEnabled } from "@/lib/earlyAccess";
import { absoluteUrl } from "@/lib/seo";

// EARLY_ACCESS is read at request time (same reason as app/page.tsx), so the
// sitemap always advertises whichever signup route is actually live.
export const dynamic = "force-dynamic";

/**
 * Public, indexable pages only. `lastModified` is deliberately omitted — a
 * value regenerated on every request would tell crawlers the whole site
 * changed constantly, which is a worse signal than no value at all.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const signupRoute = isEarlyAccessEnabled() ? "/request-access" : "/signup";

  return [
    {
      url: absoluteUrl("/"),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: absoluteUrl(signupRoute),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: absoluteUrl("/privacy"),
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];
}
