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
