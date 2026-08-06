/**
 * Single source of truth for anything that has to agree across metadata,
 * canonical URLs, the sitemap, robots.txt, and JSON-LD.
 *
 * The app is reachable on both prform.app and the Vercel deployment URL
 * (prformm.vercel.app). SITE_URL is the canonical host — every page emits a
 * canonical tag pointing at it so the two hosts don't compete as duplicates.
 */

import type { Metadata } from "next";

export const SITE_URL = "https://prform.app";

export const SITE_NAME = "PRform";

export const SITE_TAGLINE = "Sleep Sharp. Race Faster.";

/** Homepage <title>. Brand first, primary keyword second, under 60 characters. */
export const SITE_TITLE = "PRform: Sleep Optimization for Distance Runners";

/** Default meta description. Kept under 160 characters so it isn't truncated. */
export const SITE_DESCRIPTION =
  "PRform builds a nightly sleep plan for distance runners, shifting your circadian rhythm across the 10 nights before a race so you peak at the start gun.";

export const SITE_KEYWORDS = [
  "sleep for runners",
  "circadian rhythm training",
  "race day performance",
  "distance running training",
  "sleep optimization app",
  "phase advance protocol",
  "track and field training",
  "marathon sleep plan",
  "athlete recovery",
  "VDOT training paces",
];

/** Monthly subscription price, mirrored from /subscribe. Keep the two in sync. */
export const SUBSCRIPTION_PRICE_USD = "5.00";

/** Free trial length in days, mirrored from /subscribe. */
export const TRIAL_DAYS = 30;

/** Absolute URL builder for canonicals, sitemap entries, and JSON-LD @ids. */
export function absoluteUrl(path: string): string {
  return new URL(path, SITE_URL).toString();
}

/**
 * Builds a complete Open Graph block for a page.
 *
 * Next does NOT deep-merge `openGraph` — a page that declares one replaces the
 * root layout's entirely, silently dropping og:type, og:site_name, and
 * og:locale. So any page needing its own og:url or og:title restates the
 * shared fields through here rather than passing a partial object.
 */
export function pageOpenGraph(overrides: {
  url: string;
  title?: string;
  description?: string;
}): Metadata["openGraph"] {
  return {
    type: "website",
    siteName: SITE_NAME,
    locale: "en_US",
    title: overrides.title ?? `${SITE_NAME}: ${SITE_TAGLINE}`,
    description: overrides.description ?? SITE_DESCRIPTION,
    url: overrides.url,
  };
}
