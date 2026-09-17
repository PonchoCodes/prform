import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertCoachAccess } from "@/lib/entitlements";
import { deriveAthleteStatus } from "@/lib/team/status";
import {
  canNudgeAgain,
  nudgeChannelFor,
  nudgeZoneFor,
  type NudgeChannel,
  type NudgeOutcome,
} from "@/lib/team/nudge";
import { coachNudge, coachNudgePreview } from "@/lib/messaging/copy";
import { isNudgeDryRun } from "@/lib/messaging/config";
import { sendMessage } from "@/lib/messaging/send";
import { planIndexFor, PLAN_USER_SELECT } from "@/lib/messaging/plan";
import { localDateOf } from "@/lib/messaging/time";
import { toKey, toUtc, todayKey, addDays } from "@/lib/dateKeys";

// Nudge: one tap on the exception list, one message to one athlete.
//
// Identity comes from the session and the athlete from a membership id,
// which is resolved against this team's roster (via assertCoachAccess, which
// also applies the paid gate and the consent filter) before anything is
// read about them. A membership id from another team resolves to nothing.
//
// The body goes to the athlete and carries their own target. The owner gets
// a fixed preview and an outcome per athlete, and nothing else: the Nudge
// row stores the body for the record, and no route returns it.
//
// NUDGE_DRY_RUN (default on) logs and records the nudge without calling
// sendMessage at all; SMS_DRY_RUN would not cover the email fallback.

const STATUS_WINDOW_DAYS = 7;

interface NudgeResult {
  membershipId: string;
  name: string;
  outcome: NudgeOutcome;
  channel: NudgeChannel | null;
}

export async function POST(req: Request, { params }: { params: { teamId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const coachId = (session.user as any).id as string;

  const access = await assertCoachAccess(params.teamId, coachId);
  if (!access.ok && access.reason === "not_owner") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!access.ok) {
    return NextResponse.json(
      { error: "Nudges are part of the team plan.", code: "UPGRADE_REQUIRED", source: access.entitlement.source },
      { status: 402 },
    );
  }
  const { team, athletes } = access;

  const body = await req.json().catch(() => ({}));
  const all = body.all === true;
  const membershipId = typeof body.membershipId === "string" ? body.membershipId : null;
  if (!all && !membershipId) {
    return NextResponse.json({ error: "Which athlete?" }, { status: 400 });
  }

  // Who gets one. A single id is resolved against the roster; "all" means
  // every athlete the exception list would show right now, re-derived here
  // rather than trusted from the client.
  let targets: { userId: string; membershipId: string; name: string }[] = membershipId
    ? athletes.filter((a) => a.membershipId === membershipId)
    : [];
  if (all) targets = await flaggedAthletes(athletes);
  if (targets.length === 0) {
    return NextResponse.json({ error: "No one to nudge." }, { status: 404 });
  }

  const [coach, teamRow] = await Promise.all([
    prisma.user.findUnique({ where: { id: coachId }, select: { name: true } }),
    prisma.team.findUnique({ where: { id: team.id }, select: { name: true } }),
  ]);
  const coachName = coach?.name ?? "Your coach";
  const teamName = teamRow?.name ?? team.name;
  const now = new Date();
  const dryRun = isNudgeDryRun();

  const results: NudgeResult[] = [];
  for (const target of targets) {
    results.push(await nudgeOne(target, { teamId: team.id, coachId, coachName, teamName, now, dryRun }));
  }

  return NextResponse.json({ results, preview: coachNudgePreview(), dryRun });
}

async function flaggedAthletes(athletes: { userId: string; membershipId: string; name: string }[]) {
  const today = todayKey();
  const logs = await prisma.sleepLog.findMany({
    where: {
      userId: { in: athletes.map((a) => a.userId) },
      date: { gte: toUtc(addDays(today, -STATUS_WINDOW_DAYS)), lt: toUtc(today) },
    },
    select: { userId: true, date: true, actualSleepHours: true, targetSleepHours: true, needsReview: true },
    orderBy: { date: "asc" },
  });
  const byUser = new Map<string, typeof logs>();
  for (const l of logs) {
    const list = byUser.get(l.userId);
    if (list) list.push(l);
    else byUser.set(l.userId, [l]);
  }
  return athletes.filter((a) => {
    const nights = (byUser.get(a.userId) ?? []).map((l) => ({
      date: toKey(l.date),
      actualSleepHours: l.actualSleepHours,
      targetSleepHours: l.targetSleepHours,
      needsReview: l.needsReview,
    }));
    return deriveAthleteStatus(nights, STATUS_WINDOW_DAYS).flagged;
  });
}

async function nudgeOne(
  target: { userId: string; membershipId: string; name: string },
  ctx: { teamId: string; coachId: string; coachName: string; teamName: string; now: Date; dryRun: boolean },
): Promise<NudgeResult> {
  const base = { membershipId: target.membershipId, name: target.name };

  const user = await prisma.user.findUnique({
    where: { id: target.userId },
    select: {
      ...PLAN_USER_SELECT,
      phoneNumber: true,
      phoneVerifiedAt: true,
      smsStatus: true,
      ianaTimezone: true,
      email: true,
    },
  });
  if (!user) return { ...base, outcome: "unreachable", channel: null };

  const zone = nudgeZoneFor(user);
  const last = await prisma.nudge.findFirst({
    where: { teamId: ctx.teamId, athleteUserId: user.id },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (!canNudgeAgain(last?.createdAt ?? null, ctx.now, zone)) {
    return { ...base, outcome: "already_today", channel: null };
  }

  const channel = nudgeChannelFor(user);
  const localDate = localDateOf(ctx.now, zone);

  // Tonight's target, from the athlete's own plan. Null when it cannot be
  // built; the copy then points at the app rather than inventing a number.
  let targetHours: number | null = null;
  try {
    const plan = (await planIndexFor(user)).get(localDate);
    targetHours = plan?.totalSleepHours ?? null;
  } catch {
    targetHours = null;
  }
  const body = coachNudge({ coachName: ctx.coachName, teamName: ctx.teamName, targetHours });

  if (ctx.dryRun) {
    console.info(
      [
        "[nudge][DRY RUN] nothing was sent",
        `  team:    ${ctx.teamId}`,
        `  athlete: ${user.id}`,
        `  channel: ${channel}`,
        `  body:    ${JSON.stringify(body)}`,
      ].join("\n"),
    );
    await prisma.nudge.create({
      data: { teamId: ctx.teamId, coachId: ctx.coachId, athleteUserId: user.id, channel, body, providerSid: null },
    });
    return { ...base, outcome: "dry_run", channel };
  }

  const outcome = await sendMessage({
    userId: user.id,
    messageType: "COACH_NUDGE",
    body,
    localDate,
    forceChannel: channel,
  });

  switch (outcome.status) {
    case "sent":
    case "scheduled":
    case "dry_run":
    case "held": {
      const providerSid = "providerMessageSid" in outcome ? outcome.providerMessageSid : null;
      await prisma.nudge.create({
        data: { teamId: ctx.teamId, coachId: ctx.coachId, athleteUserId: user.id, channel, body, providerSid },
      });
      return { ...base, outcome: outcome.status === "dry_run" ? "dry_run" : "sent", channel };
    }
    case "no_channel":
      return { ...base, outcome: "unreachable", channel };
    case "blocked":
      return { ...base, outcome: "blocked", channel };
    default:
      return { ...base, outcome: "failed", channel };
  }
}
