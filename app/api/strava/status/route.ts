import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as any).id;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      stravaConnected: true,
      stravaAthleteId: true,
      name: true,
    },
  });

  const totalRuns = await prisma.stravaActivity.count({ where: { userId } });

  const lastActivity = await prisma.stravaActivity.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  const recentActivities = await prisma.stravaActivity.findMany({
    where: { userId },
    orderBy: { startDate: "desc" },
    take: 10,
    select: {
      stravaId: true,
      name: true,
      startDate: true,
      distance: true,
      movingTime: true,
      averageSpeed: true,
      averageHeartrate: true,
    },
  });

  return NextResponse.json({
    connected: user?.stravaConnected ?? false,
    athleteName: user?.name ?? null,
    totalRuns,
    lastSyncedAt: lastActivity?.createdAt ?? null,
    recentActivities,
  });
}

export async function DELETE() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as any).id;

  await prisma.user.update({
    where: { id: userId },
    data: {
      stravaAccessToken: null,
      stravaRefreshToken: null,
      stravaTokenExpiry: null,
      stravaAthleteId: null,
      stravaConnected: false,
    },
  });

  return NextResponse.json({ disconnected: true });
}
