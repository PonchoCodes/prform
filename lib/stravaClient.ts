import { prisma } from "@/lib/prisma";

const STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token";

async function refreshStravaToken(userId: string, refreshToken: string): Promise<string> {
  const res = await fetch(STRAVA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) {
    throw new Error(`Strava token refresh failed: ${res.status}`);
  }

  const data = await res.json();

  await prisma.user.update({
    where: { id: userId },
    data: {
      stravaAccessToken: data.access_token,
      stravaRefreshToken: data.refresh_token,
      stravaTokenExpiry: new Date(data.expires_at * 1000),
    },
  });

  return data.access_token as string;
}

export async function getValidStravaToken(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      stravaAccessToken: true,
      stravaRefreshToken: true,
      stravaTokenExpiry: true,
      stravaConnected: true,
    },
  });

  if (!user?.stravaConnected || !user.stravaAccessToken) {
    throw new Error("Strava not connected");
  }

  const now = new Date();
  const expiry = user.stravaTokenExpiry;

  if (!expiry || expiry <= now) {
    if (!user.stravaRefreshToken) throw new Error("No Strava refresh token");
    return refreshStravaToken(userId, user.stravaRefreshToken);
  }

  return user.stravaAccessToken;
}
