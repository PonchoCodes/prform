/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
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
