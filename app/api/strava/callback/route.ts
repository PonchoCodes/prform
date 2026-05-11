import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const userId = (session.user as any).id;
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  // state carries the returnTo path set by /api/strava/connect
  const returnTo = searchParams.get("state") ?? "/strava";

  if (error || !code) {
    return NextResponse.redirect(new URL(`/strava?error=access_denied`, req.url));
  }

  const tokenRes = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    return NextResponse.redirect(new URL("/strava?error=token_exchange", req.url));
  }

  const tokenData = await tokenRes.json();

  await prisma.user.update({
    where: { id: userId },
    data: {
      stravaAccessToken: tokenData.access_token,
      stravaRefreshToken: tokenData.refresh_token,
      stravaTokenExpiry: new Date(tokenData.expires_at * 1000),
      stravaAthleteId: String(tokenData.athlete?.id ?? ""),
      stravaConnected: true,
    },
  });

  // Append connected=1 flag to whatever page the caller wanted to return to
  const dest = new URL(returnTo, req.url);
  dest.searchParams.set("connected", "1");
  return NextResponse.redirect(dest);
}
