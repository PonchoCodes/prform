import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getValidStravaToken } from "@/lib/stravaClient";

const STRAVA_API = "https://www.strava.com/api/v3";

const FULL_HISTORY_DAYS = 365;
const INITIAL_SYNC_DAYS = 30;

/**
 * Carries the upstream status *and body* so the route can tell the athlete what
 * to do about it. The body matters: Strava reports the daily rate limit as a
 * 403, not a 429, and the two 403s need opposite advice — one says wait, the
 * other says reconnect.
 */
class StravaApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
    /** `X-RateLimit-Usage`: "short,daily" against the limits in `rateLimit`. */
    readonly usage: string | null,
    readonly limit: string | null,
  ) {
    super(`Strava API error: ${status}`);
    this.name = "StravaApiError";
  }

  get isRateLimited(): boolean {
    return this.status === 429 || /rate limit/i.test(this.body);
  }
}

function secondsAgo(days: number): number {
  return Math.floor((Date.now() - days * 24 * 60 * 60 * 1000) / 1000);
}

async function fetchActivitiesPage(token: string, page: number, after?: number): Promise<any[]> {
  const params = new URLSearchParams({ per_page: "50", page: String(page) });
  if (after) params.set("after", String(after));

  const res = await fetch(`${STRAVA_API}/athlete/activities?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new StravaApiError(
      res.status,
      body,
      res.headers.get("x-ratelimit-usage"),
      res.headers.get("x-ratelimit-limit"),
    );
  }
  return res.json();
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as any).id;

  const { searchParams } = new URL(req.url);
  const fullHistory = searchParams.get("fullHistory") === "true";

  let token: string;
  try {
    token = await getValidStravaToken(userId);
  } catch (err) {
    // A refresh that Strava rejects means the athlete revoked access or the
    // grant expired — reconnecting is the only fix, so say so.
    const message =
      err instanceof Error && err.message.includes("refresh failed")
        ? "Strava authorization has expired. Reconnect your account to resume syncing."
        : "Strava is not connected.";
    return NextResponse.json({ error: message, code: "REAUTH" }, { status: 400 });
  }

  try {
    // Find last synced activity to do an incremental sync
    const lastActivity = await prisma.stravaActivity.findFirst({
      where: { userId },
      orderBy: { startDate: "desc" },
      select: { startDate: true },
    });

    let afterTimestamp: number;
    if (fullHistory) {
      // A full-history sync has to ignore the incremental cursor. Anchoring it
      // to the newest activity — as this did — means it can only ever fetch
      // runs that are newer still, so any older gap stays permanently missing.
      afterTimestamp = secondsAgo(FULL_HISTORY_DAYS);
    } else if (lastActivity) {
      afterTimestamp = Math.floor(lastActivity.startDate.getTime() / 1000);
    } else {
      afterTimestamp = secondsAgo(INITIAL_SYNC_DAYS);
    }

    const allActivities: any[] = [];
    const maxPages = fullHistory ? 8 : 4;

    for (let page = 1; page <= maxPages; page++) {
      const batch = await fetchActivitiesPage(token, page, afterTimestamp);
      if (!batch.length) break;
      allActivities.push(...batch);
      if (batch.length < 50) break;
    }

    const runs = allActivities.filter((a) => a.type === "Run" || a.sport_type === "Run");

    // Which of these we already hold, so the athlete is told how many runs are
    // genuinely new rather than how many rows were written.
    const stravaIds = runs.map((r) => String(r.id));
    const existing = new Set(
      (
        await prisma.stravaActivity.findMany({
          where: { stravaId: { in: stravaIds } },
          select: { stravaId: true },
        })
      ).map((a) => a.stravaId),
    );

    let created = 0;
    let updated = 0;
    for (const run of runs) {
      if (existing.has(String(run.id))) updated++;
      else created++;
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
    }

    // Record the sync time even when nothing new came back — "last sync" means
    // when we last checked Strava, not when an activity last appeared
    await prisma.user.update({
      where: { id: userId },
      data: { lastStravaSyncAt: new Date() },
    });

    return NextResponse.json({ synced: created, updated, total: runs.length });
  } catch (err) {
    // Every exit from here returns a JSON body. An uncaught throw produced an
    // empty 500, and the client's res.json() on an empty body is what surfaced
    // as "JSON.parse: unexpected end of data".
    if (err instanceof StravaApiError) {
      // Always log what Strava actually said — the status alone is ambiguous.
      console.error(
        `[strava/sync] ${err.status} usage=${err.usage ?? "?"} limit=${err.limit ?? "?"} body=${err.body.slice(0, 300)}`,
      );

      if (err.isRateLimited) {
        // Usage is "short,daily". A blown daily quota resets at midnight UTC;
        // the 15-minute window resets on the quarter hour.
        const daily = err.usage?.split(",")[1];
        const dailyLimit = err.limit?.split(",")[1];
        const detail =
          daily && dailyLimit && Number(daily) >= Number(dailyLimit)
            ? `Daily quota used (${daily}/${dailyLimit}). It resets at midnight UTC.`
            : "The 15-minute window resets on the quarter hour.";
        return NextResponse.json(
          { error: `Strava's rate limit is in effect. ${detail}`, code: "RATE_LIMIT" },
          { status: 429 },
        );
      }

      if (err.status === 401) {
        return NextResponse.json(
          {
            error: "Strava authorization has expired. Reconnect your account to resume syncing.",
            code: "REAUTH",
          },
          { status: 401 },
        );
      }

      if (err.status === 403) {
        // Not rate limiting, so Strava is refusing the grant itself — most
        // often an authorization made without the private-activity permission.
        return NextResponse.json(
          {
            error:
              "Strava refused the request. Reconnect and make sure the private-activity permission stays checked.",
            code: "REAUTH",
          },
          { status: 403 },
        );
      }

      return NextResponse.json(
        { error: `Strava returned an error (${err.status}). Try again shortly.`, code: "UPSTREAM" },
        { status: 502 },
      );
    }

    console.error("[strava/sync] failed", err);
    return NextResponse.json(
      { error: "Sync failed. Please try again.", code: "UNKNOWN" },
      { status: 500 },
    );
  }
}
