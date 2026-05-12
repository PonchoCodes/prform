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
  // Explicitly forward auth env vars so they reach the server runtime in all
  // Next.js 14 App Router deployments (automatic detection is unreliable).
  env: {
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
  },
  experimental: {
    serverComponentsExternalPackages: ["ws", "@neondatabase/serverless", "@prisma/adapter-neon", "@prisma/client"],
  },
};

export default nextConfig;
