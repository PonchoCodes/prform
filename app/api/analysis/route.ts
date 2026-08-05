import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { analyzePerformance, type StravaActivityInput } from "@/lib/performanceAnalysis";
import type { SleepLogForCorrelation } from "@/lib/performanceAnalysis";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as any).id;
  const { searchParams } = new URL(req.url);
  const daysParam = searchParams.get("days");
  const windowDays = (daysParam === "30" ? 30 : daysParam === "60" ? 60 : 90) as 30 | 60 | 90;

  const [user, activities, sleepLogs] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        age: true,
        biologicalSex: true,
        userMaxHR: true,
        userThresholdHR: true,
        currentBedTime: true,
        currentWakeTime: true,
        stravaConnected: true,
        prDistanceId: true,
        prTimeSeconds: true,
        prRecency: true,
        prSetOn: true,
      },
    }),
    prisma.stravaActivity.findMany({ where: { userId }, orderBy: { startDate: "desc" } }),
    prisma.sleepLog.findMany({ where: { userId }, orderBy: { date: "desc" } }),
  ]);

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // A declared PR is enough to produce a pace table on day one, so Strava is no
  // longer required here — without either, the report simply comes back empty
  // and the UI prompts for whichever is missing.
  if (!user.stravaConnected && !user.prDistanceId) {
    return NextResponse.json({ error: "No fitness data", code: "NO_DATA" }, { status: 400 });
  }

  const activityInputs: StravaActivityInput[] = activities.map((a) => ({
    stravaId: a.stravaId,
    name: a.name,
    startDate: a.startDate,
    distance: a.distance,
    movingTime: a.movingTime,
    elapsedTime: a.elapsedTime,
    totalElevGain: a.totalElevGain,
    averageSpeed: a.averageSpeed,
    maxSpeed: a.maxSpeed,
    averageHeartrate: a.averageHeartrate,
    maxHeartrate: a.maxHeartrate,
    sufferScore: a.sufferScore,
    workoutType: a.workoutType,
    averageCadence: a.averageCadence,
    externalId: a.externalId,
  }));

  const sleepLogsForCorrelation: SleepLogForCorrelation[] = sleepLogs.map((l) => ({
    date: new Date(l.date).toISOString().slice(0, 10),
    actualBedtime: l.actualBedtime,
    recommendedBedtime: l.recommendedBedtime,
    hitTarget: l.hitTarget,
    source: l.source,
  }));

  const report = analyzePerformance(activityInputs, user, windowDays, sleepLogsForCorrelation);

  return NextResponse.json(report);
}
