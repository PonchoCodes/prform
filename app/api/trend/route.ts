import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  calculateVDOT,
  classifyCompliance,
  type StravaActivityInput,
} from "@/lib/performanceAnalysis";
import { resolvePaces } from "@/lib/paceSource";
import { buildSleepPaceTrend, type TrendNight, type TrendRun } from "@/lib/trend";

const DEFAULT_WINDOW_DAYS = 60;
const MAX_WINDOW_DAYS = 180;

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as any).id;
  const requested = Number(new URL(req.url).searchParams.get("days"));
  const windowDays =
    Number.isFinite(requested) && requested > 0
      ? Math.min(requested, MAX_WINDOW_DAYS)
      : DEFAULT_WINDOW_DAYS;

  // The rolling mean reaches back a further 7 days at the window's left edge,
  // so the query has to as well or the first week of the chart reads as a slump.
  const fetchFrom = new Date();
  fetchFrom.setDate(fetchFrom.getDate() - (windowDays + 7));

  const [user, sleepLogs, activities] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        prDistanceId: true,
        prTimeSeconds: true,
        prRecency: true,
        prSetOn: true,
      },
    }),
    prisma.sleepLog.findMany({
      // Flagged nights are excluded at the query, not filtered later. A row is
      // flagged precisely because its duration could not be trusted, and this
      // chart is the thing the whole product points at — a single 27-hour night
      // would lift a fortnight of the rolling mean and look like progress.
      // The write path already refuses to store a duration on a flagged row;
      // this is the second lock on the same door.
      where: { userId, date: { gte: fetchFrom }, needsReview: false },
      orderBy: { date: "asc" },
      select: { date: true, actualSleepHours: true, targetSleepHours: true },
    }),
    prisma.stravaActivity.findMany({
      where: { userId, startDate: { gte: fetchFrom } },
      orderBy: { startDate: "asc" },
    }),
  ]);

  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

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

  const observed = calculateVDOT(activityInputs);
  const resolved = resolvePaces(user, {
    vdot: observed.vdot,
    qualifyingEfforts: observed.qualifyingEfforts,
  });

  const nights: TrendNight[] = sleepLogs.map((l) => ({
    date: new Date(l.date).toISOString().slice(0, 10),
    actualSleepHours: l.actualSleepHours,
    targetSleepHours: l.targetSleepHours,
  }));

  // Without a resolved pace table there is nothing to score runs against, so
  // the compliance series is empty rather than wrong. The countdown copy then
  // asks for runs, and the verdict is already asking for a PR.
  const runs: TrendRun[] = resolved.paces
    ? activityInputs.map((a) => ({
        date: new Date(a.startDate).toISOString().slice(0, 10),
        onTarget: classifyCompliance(a, resolved.paces!) === "ON_TARGET",
      }))
    : [];

  const trend = buildSleepPaceTrend(nights, runs, { days: windowDays });

  return NextResponse.json({
    ...trend,
    windowDays,
    hasPaces: Boolean(resolved.paces),
  });
}
