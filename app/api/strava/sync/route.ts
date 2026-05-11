import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getValidStravaToken } from "@/lib/stravaClient";

const STRAVA_API = "https://www.strava.com/api/v3";

async function fetchActivitiesPage(token: string, page: number, after?: number): Promise<any[]> {
  const params = new URLSearchParams({ per_page: "50", page: String(page) });
  if (after) params.set("after", String(after));

  const res = await fetch(`${STRAVA_API}/athlete/activities?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) throw new Error(`Strava API error: ${res.status}`);
  return res.json();
}

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as any).id;

  let token: string;
  try {
    token = await getValidStravaToken(userId);
  } catch {
    return NextResponse.json({ error: "Strava not connected" }, { status: 400 });
  }

  // Find last synced activity to do an incremental sync
  const lastActivity = await prisma.stravaActivity.findFirst({
    where: { userId },
    orderBy: { startDate: "desc" },
    select: { startDate: true },
  });

  const afterTimestamp = lastActivity
    ? Math.floor(lastActivity.startDate.getTime() / 1000)
    : undefined;

  const allActivities: any[] = [];
  const maxPages = afterTimestamp ? 4 : 4; // 4 pages × 50 = 200 max for initial sync

  for (let page = 1; page <= maxPages; page++) {
    const batch = await fetchActivitiesPage(token, page, afterTimestamp);
    if (!batch.length) break;
    allActivities.push(...batch);
    if (batch.length < 50) break;
  }

  const runs = allActivities.filter((a) => a.type === "Run" || a.sport_type === "Run");

  let synced = 0;
  for (const run of runs) {
    await prisma.stravaActivity.upsert({
      where: { stravaId: String(run.id) },
      create: {
        stravaId: String(run.id),
        userId,
        name: run.name ?? "Run",
        startDate: new Date(run.start_date),
        distance: run.distance ?? 0,
        movingTime: run.moving_time ?? 0,
        elapsedTime: run.elapsed_time ?? 0,
        totalElevGain: run.total_elevation_gain ?? 0,
        averageSpeed: run.average_speed ?? 0,
        maxSpeed: run.max_speed ?? 0,
        averageHeartrate: run.average_heartrate ?? null,
        maxHeartrate: run.max_heartrate ?? null,
        sufferScore: run.suffer_score ?? null,
        workoutType: run.workout_type ?? null,
        averageCadence: run.average_cadence ?? null,
        externalId: run.external_id ?? null,
      },
      update: {
        name: run.name ?? "Run",
        averageHeartrate: run.average_heartrate ?? null,
        maxHeartrate: run.max_heartrate ?? null,
        sufferScore: run.suffer_score ?? null,
      },
    });
    synced++;
  }

  return NextResponse.json({ synced, total: runs.length });
}
