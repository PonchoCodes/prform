import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { isDigestDryRun } from "@/lib/messaging/config";
import { isValidTimeZone, localDateOf } from "@/lib/messaging/time";
import { resolveEntitlement } from "@/lib/entitlements";
import { buildDigest } from "@/lib/team/digest";
import { renderDigestEmail } from "@/lib/team/digestEmail";
import { digestDecision } from "@/lib/team/digestSchedule";
import {
  loadAttention,
  loadMeetReadiness,
  loadSessionForecasts,
  loadTeamTrend,
  type RosterAthlete,
} from "@/lib/team/coachView";
import { addDays, toKey, toUtc } from "@/lib/dateKeys";

// The Monday coach digest. Runs every hour; a team is due when it is 06:00
// on a Monday in that team's zone and nothing has been stamped for that
// Monday yet (lib/team/digestSchedule.ts).
//
// Per team it loads exactly what the dashboard loads — the exception list,
// the next meet, the coming week's forecasts, the trend — through the same
// lib/team/coachView.ts loaders, hands them to buildDigest, and emails the
// owner. The roster is the consented ACTIVE membership, the same filter
// assertCoachAccess applies; the paid gate is applied here too, because a
// free team's owner is not shown per-athlete lines on the dashboard and
// must not be mailed them either.
//
// DIGEST_DRY_RUN (default on) logs the rendered digest and sends nothing.
// A dry run leaves the stamp alone, so flipping the flag sends the digest on
// the next due hour rather than a week later.

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  // `force` builds and sends (or dry-runs) every enabled team's digest now,
  // so the whole path can be exercised without waiting for a Monday.
  const forced = new URL(req.url).searchParams.get("force") === "1";
  const dryRun = isDigestDryRun();

  const teams = await prisma.team.findMany({
    where: { digestEnabled: true },
    select: {
      id: true,
      name: true,
      timezone: true,
      digestEnabled: true,
      digestLastSentOn: true,
      entitlementSource: true,
      entitlementExpiresAt: true,
      seatLimit: true,
      subscriptionStatus: true,
      owner: { select: { email: true } },
      memberships: {
        where: { status: "ACTIVE" },
        select: { id: true, userId: true, joinedAt: true, consentAt: true, user: { select: { name: true } } },
        orderBy: { joinedAt: "asc" },
      },
    },
  });

  const tally = { sent: 0, logged: 0, skipped: 0, notEntitled: 0, failed: 0 };

  for (const team of teams) {
    if (!isValidTimeZone(team.timezone)) {
      console.error(`[digest] team=${team.id} has unusable timezone ${JSON.stringify(team.timezone)}`);
      tally.failed++;
      continue;
    }

    const decision = digestDecision(team, now);
    if (!decision.due && !forced) {
      tally.skipped++;
      continue;
    }
    const localMonday = decision.due ? decision.localMonday : localDateOf(now, team.timezone);

    if (!resolveEntitlement(team).features.perAthleteStats) {
      tally.notEntitled++;
      continue;
    }

    const roster: RosterAthlete[] = team.memberships
      .filter((m) => m.consentAt != null)
      .map((m) => ({
        userId: m.userId,
        membershipId: m.id,
        name: m.user.name ?? "Unnamed athlete",
        joinedAt: m.joinedAt,
      }));

    try {
      const today = localMonday;
      const sessionRows = await prisma.plannedSession.findMany({
        where: { teamId: team.id, date: { gte: toUtc(today), lt: toUtc(addDays(today, 7)) } },
        orderBy: { date: "asc" },
        select: { id: true, date: true, sessionType: true },
      });
      const [attention, meet, forecasts, trend] = await Promise.all([
        loadAttention(roster, today),
        loadMeetReadiness(team.id, roster, today),
        loadSessionForecasts(team.id, roster, sessionRows, today),
        loadTeamTrend(team.id, roster, today),
      ]);
      const forecastById = new Map(forecasts.map((f) => [f.sessionId, f]));

      const digest = buildDigest({
        teamName: team.name,
        today,
        rosterSize: attention.rosterSize,
        attention: attention.exceptions.map((e) => ({
          name: e.name,
          color: e.color,
          trend: e.trend,
          shortDays: e.shortDays,
          unlogged: e.unlogged,
          nightsLogged: e.nightsLogged,
        })),
        meet,
        sessions: sessionRows.map((s) => ({
          date: toKey(s.date),
          sessionType: s.sessionType,
          forecast: forecastById.get(s.id) ?? null,
        })),
        trend,
      });
      const email = renderDigestEmail(digest, team.id);

      if (dryRun) {
        console.info(
          [
            "[digest][DRY RUN] nothing was sent",
            `  team:    ${team.id} (${team.name})`,
            `  to:      ${team.owner.email}`,
            `  monday:  ${localMonday}`,
            `  subject: ${email.subject}`,
            "",
            email.text,
          ].join("\n"),
        );
        tally.logged++;
        continue;
      }

      const result = await sendEmail(team.owner.email, email.subject, email.html, { text: email.text });
      if (!result.ok) {
        console.error(`[digest] send failed team=${team.id}: ${result.error}`);
        tally.failed++;
        continue;
      }
      await prisma.team.update({ where: { id: team.id }, data: { digestLastSentOn: localMonday } });
      tally.sent++;
    } catch (e) {
      console.error(`[digest] team=${team.id} failed:`, e);
      tally.failed++;
    }
  }

  return NextResponse.json({ ok: true, dryRun, forced, ...tally });
}
