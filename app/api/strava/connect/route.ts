import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { createHmac } from "crypto";
import { prisma } from "@/lib/prisma";
import { connectedStravaAthleteCount, STRAVA_ATHLETE_CAP } from "@/lib/stravaAccess";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = (session.user as any).id as string;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { stravaEligible: true, stravaConnected: true },
  });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Not eligible means this route does not exist for them. No error page, no
  // explanation of a queue they are not in: the UI never renders a link here,
  // and a hand-typed URL lands on the dashboard.
  if (!user.stravaEligible && !user.stravaConnected) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  // Strava Standard tier allows 10 connected athletes. Eligibility is assigned
  // by hand, but this cap is Strava's and holds regardless.
  if (!user.stravaConnected) {
    const connectedCount = await connectedStravaAthleteCount();
    if (connectedCount >= STRAVA_ATHLETE_CAP) {
      return NextResponse.redirect(new URL("/strava?error=unavailable", req.url));
    }
  }

  const clientId = process.env.STRAVA_CLIENT_ID;
  // Use the live request origin so Strava redirects back to the current
  // deployment, not whichever URL happens to be pinned in env vars.
  const appUrl = new URL(req.url).origin;
  const redirectUri = process.env.STRAVA_REDIRECT_URI ?? `${appUrl}/api/strava/callback`;

  // Allow callers to pass a returnTo path (e.g. /onboarding?step=4) so the
  // callback can redirect back to the right place after OAuth completes.
  const { searchParams } = new URL(req.url);
  const returnTo = searchParams.get("returnTo") ?? "/strava";

  // Sign userId + returnTo into state so the callback can identify the user
  // without relying on the session cookie surviving a cross-site redirect.
  const statePayload = Buffer.from(JSON.stringify({ userId, returnTo })).toString("base64url");
  const sig = createHmac("sha256", process.env.NEXTAUTH_SECRET!).update(statePayload).digest("hex");
  const state = `${statePayload}.${sig}`;

  const params = new URLSearchParams({
    client_id: clientId!,
    response_type: "code",
    redirect_uri: redirectUri,
    approval_prompt: "force",
    scope: "activity:read_all",
    state,
  });

  return NextResponse.redirect(`https://www.strava.com/oauth/authorize?${params.toString()}`);
}
