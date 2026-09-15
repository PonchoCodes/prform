import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin";
import { STRAVA_ATHLETE_CAP, connectedStravaAthleteCount } from "@/lib/stravaAccess";

// Who has asked for Strava sync, and the switch that grants it.
//
// This is the one admin surface that returns names and emails, and it does so
// because the task is "turn this on for this person", and a list of anonymous
// counts cannot be acted on. Nothing behavioural is returned with them: no
// sleep, no streaks, no logs. /api/admin/retention stays counts-only, and this
// route is not a way around it.

export const dynamic = "force-dynamic";

export async function GET() {
  const forbidden = await requireAdmin();
  if (forbidden) return forbidden;

  const [users, connectedCount] = await Promise.all([
    prisma.user.findMany({
      where: { OR: [{ stravaInterest: true }, { stravaEligible: true }] },
      select: {
        id: true,
        name: true,
        email: true,
        stravaInterest: true,
        stravaEligible: true,
        stravaConnected: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    }),
    connectedStravaAthleteCount(),
  ]);

  return NextResponse.json({
    users,
    connectedCount,
    cap: STRAVA_ATHLETE_CAP,
  });
}

export async function POST(req: Request) {
  const forbidden = await requireAdmin();
  if (forbidden) return forbidden;

  const body = await req.json().catch(() => ({}));
  const userId = typeof body.userId === "string" ? body.userId : "";
  const eligible = body.eligible;

  if (!userId || typeof eligible !== "boolean") {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  // Revoking eligibility does not disconnect anyone. Someone already synced
  // keeps their connection and their history; the flag governs who may start.
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { stravaEligible: eligible },
    select: { id: true, stravaEligible: true },
  });

  return NextResponse.json(updated);
}
