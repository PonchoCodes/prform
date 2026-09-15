// Who can connect Strava.
//
// Eligibility is per user (User.stravaEligible) and assigned by hand from the
// admin page. Not a queue, not a waitlist, not a position in line: for an
// athlete who is not eligible, Strava does not appear in this product at all.
// The alternative, a disabled button with an explanation, is a worse thing to
// ship: it advertises something the person cannot have and turns every session
// into a reminder of it.
//
// The tier cap below is separate and stays. It is a limit Strava imposes on us,
// not a policy of ours, and it holds even if eligibility is handed out too
// freely by mistake.

import { prisma } from "@/lib/prisma";

/** Connected-athlete ceiling on the Strava Standard tier. */
export const STRAVA_ATHLETE_CAP = 10;

export async function connectedStravaAthleteCount(): Promise<number> {
  return prisma.user.count({ where: { stravaConnected: true } });
}
