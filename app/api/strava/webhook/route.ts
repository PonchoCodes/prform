import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getValidStravaToken } from "@/lib/stravaClient";

const STRAVA_API = "https://www.strava.com/api/v3";

// GET: Strava subscription verification challenge
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const verifyToken = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && verifyToken === process.env.STRAVA_WEBHOOK_VERIFY_TOKEN) {
    return NextResponse.json({ "hub.challenge": challenge });
  }

  return new NextResponse("Forbidden", { status: 403 });
}

// POST: Strava event push
export async function POST(req: NextRequest) {
  // Respond 200 immediately; process async to meet Strava's 2s requirement
  const body = await req.json().catch(() => ({}));
  setImmediate(() => handleEvent(body));
  return new NextResponse("OK", { status: 200 });
}

async function handleEvent(body: any) {
  const { owner_id, object_type, object_id, aspect_type } = body ?? {};

  if (!owner_id || !object_type || !aspect_type) return;

  if (object_type === "athlete" && aspect_type === "delete") {
    await handleDeauthorization(owner_id);
    return;
  }

  if (object_type === "activity" && aspect_type === "create") {
    await handleActivityCreate(owner_id, object_id);
    return;
  }

  if (object_type === "activity" && aspect_type === "delete") {
    await handleActivityDelete(owner_id, object_id);
    return;
  }
}

async function handleDeauthorization(stravaAthleteId: number) {
  const user = await prisma.user.findFirst({
    where: { stravaAthleteId: String(stravaAthleteId) },
    select: { id: true },
  });
  if (!user) return;

  await prisma.stravaActivity.deleteMany({ where: { userId: user.id } });
  await prisma.user.update({
    where: { id: user.id },
    data: {
      stravaAccessToken: null,
      stravaRefreshToken: null,
      stravaTokenExpiry: null,
      stravaConnected: false,
      stravaAthleteId: null,
      stravaWebhookSubscriptionId: null,
    },
  });
}

async function handleActivityCreate(stravaAthleteId: number, activityId: number) {
  const user = await prisma.user.findFirst({
    where: { stravaAthleteId: String(stravaAthleteId) },
    select: { id: true },
  });
  if (!user) return;

  let token: string;
  try {
    token = await getValidStravaToken(user.id);
  } catch {
    return;
  }

  const res = await fetch(`${STRAVA_API}/activities/${activityId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return;

  const run = await res.json();
  if (run.type !== "Run" && run.sport_type !== "Run") return;

  await prisma.stravaActivity.upsert({
    where: { stravaId: String(run.id) },
    create: {
      stravaId: String(run.id),
      userId: user.id,
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
}

async function handleActivityDelete(stravaAthleteId: number, activityId: number) {
  const user = await prisma.user.findFirst({
    where: { stravaAthleteId: String(stravaAthleteId) },
    select: { id: true },
  });
  if (!user) return;

  await prisma.stravaActivity.deleteMany({
    where: { stravaId: String(activityId), userId: user.id },
  });
}
