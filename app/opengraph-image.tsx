import { ImageResponse } from "next/og";
import { SITE_DESCRIPTION } from "@/lib/seo";

// Shared by Open Graph and Twitter — Next falls back to this file for the
// twitter card when no twitter-image is present.
//
// Must be the edge build of next/og. Its node build resolves the bundled
// fallback font through fileURLToPath on a path that is malformed on Windows
// (".\file:\C:\...\noto-sans.ttf"), which crashes both `next build` and the
// route at request time — the same wall app/icon.tsx and app/apple-icon.tsx
// hit. The edge build does no such path resolution.
export const runtime = "edge";

export const alt = "PRform: Sleep Sharp. Race Faster.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// NOTE: Satori ships only a regular-weight fallback face, so `fontWeight` below
// is inert and the type renders lighter than the site's font-black headings.
// Supplying app/fonts/GeistVF.woff was tried and abandoned: node:fs is
// unavailable in the edge runtime, and the documented
// `fetch(new URL(..., import.meta.url))` pattern resolves to a root-relative
// path with no origin to fetch from. Weight here comes from scale, tracking,
// and the accent block instead.

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "#0A0A0A",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          fontFamily: "sans-serif",
          color: "#FFFFFF",
        }}
      >
        {/* Eyebrow */}
        <div
          style={{
            display: "flex",
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: 8,
            textTransform: "uppercase",
            color: "#E8FF00",
          }}
        >
          Performance Sleep Optimization
        </div>

        {/* Headline */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              fontSize: 104,
              fontWeight: 900,
              lineHeight: 1,
              letterSpacing: -3,
              textTransform: "uppercase",
            }}
          >
            Sleep Sharp.
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 104,
              fontWeight: 900,
              lineHeight: 1,
              letterSpacing: -3,
              textTransform: "uppercase",
            }}
          >
            Race Faster.
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 28,
              fontSize: 26,
              lineHeight: 1.4,
              color: "#AAAAAA",
              maxWidth: 880,
            }}
          >
            {SITE_DESCRIPTION}
          </div>
        </div>

        {/* Wordmark */}
        <div style={{ display: "flex", alignItems: "center" }}>
          <div
            style={{
              display: "flex",
              fontSize: 40,
              fontWeight: 900,
              letterSpacing: -1,
              textTransform: "uppercase",
            }}
          >
            PR
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 40,
              fontWeight: 900,
              letterSpacing: -1,
              textTransform: "uppercase",
              background: "#E8FF00",
              color: "#0A0A0A",
              paddingLeft: 8,
              paddingRight: 8,
              marginLeft: 4,
            }}
          >
            form
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
