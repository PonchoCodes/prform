import { NextRequest, NextResponse } from "next/server";
import { flushDuePushMessages } from "@/lib/messaging/pushFlush";

// Drains the held-push queue. See lib/messaging/pushFlush.ts for what it does;
// this file is about how often it needs to run, which is the part that has to
// be decided outside the code.
//
// ── This endpoint needs a frequent trigger, and Vercel Hobby cannot give it ──
//
// A scheduled text is held by Twilio and arrives on the minute regardless of
// what this app is doing. A scheduled push is held by us, so it arrives when
// this endpoint next runs. If it runs once a day, an evening question queued
// for 21:00 goes out at whatever hour the daily cron happens to fire, and
// lib/messaging/pushFlush.ts abandons it as stale rather than sending it at the
// wrong time — correct behaviour, and useless behaviour.
//
// Vercel Hobby allows two cron jobs, triggered once a day. vercel.json already
// has two (strava-reminders, messaging). So this entry is NOT in vercel.json:
// adding a third would fail the deploy, and that is a worse outcome than a
// documented gap. On Pro, add:
//
//     { "path": "/api/cron/push-flush", "schedule": "*/5 * * * *" }
//
// Until then the working alternative is any external pinger — cron-job.org, a
// GitHub Actions schedule, an Upstash QStash schedule — hitting this URL every
// five minutes with the same Bearer CRON_SECRET. The endpoint does not care
// what triggers it.
//
// Five minutes is the right granularity: the evening question is timed 90
// minutes before a computed bedtime, and nobody's sleep is affected by that
// arriving at 20:03 instead of 20:00.

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await flushDuePushMessages();
  return NextResponse.json({ ok: true, ...result });
}
