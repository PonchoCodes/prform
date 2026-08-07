import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertOwnerOf } from "@/lib/team/guard";

// Planned sessions for a team. Owner only, every verb — athletes receive
// these through the workout merge layer on their own plan, never from here.

const SESSION_TYPES = new Set([
  "easy",
  "moderate",
  "tempo",
  "long_run",
  "track",
  "race",
  "rest",
  "cross_train",
]);

// A session shorter than a warm-up or longer than a race day is a typo, not a
// plan. Bounds exist so a slip in the form cannot distort the athlete's
// training-load bonus for that day.
const MIN_SESSION_MINUTES = 5;
const MAX_SESSION_MINUTES = 600;

export async function GET(_req: Request, { params }: { params: { teamId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id as string;

  const team = await assertOwnerOf(params.teamId, userId);
  if (!team) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const from = new Date();
  from.setHours(0, 0, 0, 0);
  from.setDate(from.getDate() - 7);

  const sessions = await prisma.plannedSession.findMany({
    where: { teamId: team.id, date: { gte: from } },
    orderBy: { date: "asc" },
    select: {
      id: true,
      date: true,
      sessionType: true,
      durationMinutes: true,
      description: true,
      targetPaces: true,
    },
  });

  return NextResponse.json({ sessions });
}

export async function POST(req: Request, { params }: { params: { teamId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id as string;

  const team = await assertOwnerOf(params.teamId, userId);
  if (!team) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));

  const date = typeof body.date === "string" ? new Date(body.date) : null;
  if (!date || Number.isNaN(date.getTime())) {
    return NextResponse.json({ error: "A session needs a date." }, { status: 400 });
  }
  if (typeof body.sessionType !== "string" || !SESSION_TYPES.has(body.sessionType)) {
    return NextResponse.json({ error: "Unknown session type." }, { status: 400 });
  }

  // Required. The merge layer feeds this straight into the athlete's training
  // load, so it is rejected rather than guessed when missing.
  const durationMinutes =
    typeof body.durationMinutes === "number"
      ? body.durationMinutes
      : typeof body.durationMinutes === "string" && body.durationMinutes.trim() !== ""
        ? Number(body.durationMinutes)
        : NaN;
  if (!Number.isInteger(durationMinutes)) {
    return NextResponse.json(
      { error: "A session needs a duration in whole minutes." },
      { status: 400 },
    );
  }
  if (durationMinutes < MIN_SESSION_MINUTES || durationMinutes > MAX_SESSION_MINUTES) {
    return NextResponse.json(
      { error: `Duration must be between ${MIN_SESSION_MINUTES} and ${MAX_SESSION_MINUTES} minutes.` },
      { status: 400 },
    );
  }

  const created = await prisma.plannedSession.create({
    data: {
      teamId: team.id,
      date,
      sessionType: body.sessionType,
      durationMinutes,
      description:
        typeof body.description === "string" && body.description.trim()
          ? body.description.trim().slice(0, 500)
          : null,
      targetPaces:
        typeof body.targetPaces === "string" && body.targetPaces.trim()
          ? body.targetPaces.trim().slice(0, 200)
          : null,
    },
    select: {
      id: true,
      date: true,
      sessionType: true,
      durationMinutes: true,
      description: true,
      targetPaces: true,
    },
  });

  return NextResponse.json(created, { status: 201 });
}

export async function DELETE(req: Request, { params }: { params: { teamId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id as string;

  const team = await assertOwnerOf(params.teamId, userId);
  if (!team) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  if (typeof body.id !== "string") {
    return NextResponse.json({ error: "Which session?" }, { status: 400 });
  }

  // deleteMany with the teamId in the filter, so a session id from another
  // team deletes nothing rather than trusting the id alone.
  const result = await prisma.plannedSession.deleteMany({
    where: { id: body.id, teamId: team.id },
  });

  return NextResponse.json({ ok: true, deleted: result.count });
}
