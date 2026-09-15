import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/seo";

/**
 * Public, indexable pages only. `lastModified` is deliberately omitted — a
 * value regenerated on every request would tell crawlers the whole site
 * changed constantly, which is a worse signal than no value at all.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: absoluteUrl("/"),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: absoluteUrl("/signup"),
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
