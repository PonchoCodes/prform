/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Type check passes locally (tsc --noEmit). Vercel's build container
    // OOM-kills the checker on a cold run (no tsbuildinfo cache, Node 20 vs
    // local Node 24). Rely on local checks; remove once Vercel caching is stable.
    ignoreBuildErrors: true,
  },
  experimental: {
    serverComponentsExternalPackages: ["ws", "@neondatabase/serverless", "@prisma/adapter-neon", "@prisma/client"],
  },
  async headers() {
    return [
      {
        // The service worker must never be served from a cache. A stale sw.js
        // is a bug that cannot be fixed by deploying — the browser keeps using
        // the copy it has until the cached one expires, so a broken worker
        // could outlive several releases.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        // Same reasoning, milder: the manifest changing is how an installed app
        // learns about new icons or a new start_url.
        source: "/manifest.json",
        headers: [{ key: "Cache-Control", value: "public, max-age=0, must-revalidate" }],
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/sleep-history",
        destination: "/sleep",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
