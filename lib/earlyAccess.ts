import { prisma } from "@/lib/prisma";

// Max approved early-access members. Intentionally set ABOVE the Strava
// Standard tier's 10-connected-athlete limit — the two caps are independent
// (see STRAVA_ATHLETE_CAP below). Approved members past the Strava cap can
// still use the app with manual/template workouts; only the first
// STRAVA_ATHLETE_CAP to connect Strava get through the OAuth gate.
export const EARLY_ACCESS_APPROVAL_CAP = 25;

// Hard limit on connected Strava athletes imposed by the Strava API tier.
// This cap is NOT tied to the EARLY_ACCESS flag and must never be bypassed
// by flipping the flag off.
export const STRAVA_ATHLETE_CAP = 10;

export function isEarlyAccessEnabled(): boolean {
  return process.env.EARLY_ACCESS === "true";
}

export async function isEmailApproved(email: string): Promise<boolean> {
  // Waitlist emails are stored trimmed + lowercased by /api/waitlist.
  const entry = await prisma.waitlist.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: { status: true },
  });
  return entry?.status === "APPROVED";
}

export async function approvedWaitlistCount(): Promise<number> {
  return prisma.waitlist.count({ where: { status: "APPROVED" } });
}

export async function connectedStravaAthleteCount(): Promise<number> {
  return prisma.user.count({ where: { stravaConnected: true } });
}
