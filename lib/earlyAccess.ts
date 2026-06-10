import { prisma } from "@/lib/prisma";

// Max approved early-access members. Matches the Strava Standard tier's
// 10-connected-athlete limit, but the two caps are enforced independently —
// see STRAVA_ATHLETE_CAP below.
export const EARLY_ACCESS_APPROVAL_CAP = 10;

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
