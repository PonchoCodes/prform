import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function DELETE() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as any).id;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { stravaAccessToken: true },
  });

  // Revoke access at Strava (best-effort; proceed even if it fails)
  if (user?.stravaAccessToken) {
    await fetch("https://www.strava.com/oauth/deauthorize", {
      method: "POST",
      headers: { Authorization: `Bearer ${user.stravaAccessToken}` },
    }).catch(() => {});
  }

  await prisma.stravaActivity.deleteMany({ where: { userId } });
  await prisma.user.update({
    where: { id: userId },
    data: {
      stravaAccessToken: null,
      stravaRefreshToken: null,
      stravaTokenExpiry: null,
      stravaAthleteId: null,
      stravaConnected: false,
      stravaWebhookSubscriptionId: null,
    },
  });

  return NextResponse.json({ success: true });
}
