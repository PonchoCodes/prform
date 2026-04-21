import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const checks: Record<string, string> = {
    DATABASE_URL: process.env.DATABASE_URL ? "set" : "MISSING",
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET ? "set" : "MISSING",
    NEXTAUTH_URL: process.env.NEXTAUTH_URL ?? "(not set — Vercel auto-detects)",
    NODE_ENV: process.env.NODE_ENV ?? "unknown",
  };

  let dbStatus = "unknown";
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbStatus = "connected";
  } catch (e: any) {
    dbStatus = `error: ${e?.message ?? String(e)}`;
  }

  return NextResponse.json({ checks, db: dbStatus });
}
