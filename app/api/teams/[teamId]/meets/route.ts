import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertOwnerOf } from "@/lib/team/guard";

// Team meets. Owner only, every verb, like planned sessions — athletes get
// these through lib/team/meets.ts on their own plan, never from here.
//
// Free teams can add them. The ramp a team meet fires is an athlete benefit,
// and the athlete's plan is not behind the team plan. What is behind it is
// the per-athlete readiness view, which lives in ./meet-readiness.

const MEET_SELECT = {
  id: true,
  name: true,
  date: true,
  distances: true,
} as const;

export async function GET(_req: Request, { params }: { params: { teamId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id as string;

  const team = await assertOwnerOf(params.teamId, userId);
  if (!team) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // A week back, so a meet that just happened is still on the list to remove.
  const from = new Date();
  from.setUTCHours(0, 0, 0, 0);
  from.setUTCDate(from.getUTCDate() - 7);

  const meets = await prisma.teamMeet.findMany({
    where: { teamId: team.id, date: { gte: from } },
    orderBy: { date: "asc" },
    select: MEET_SELECT,
  });

  return NextResponse.json({ meets });
}

export async function POST(req: Request, { params }: { params: { teamId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id as string;

  const team = await assertOwnerOf(params.teamId, userId);
  if (!team) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));

  const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
  if (name.length < 2) {
    return NextResponse.json({ error: "A meet needs a name." }, { status: 400 });
  }
  // "YYYY-MM-DD" parses as UTC midnight, the same instant a Meet or a
  // SleepLog stores for that calendar date.
  const date = typeof body.date === "string" ? new Date(body.date) : null;
  if (!date || Number.isNaN(date.getTime())) {
    return NextResponse.json({ error: "A meet needs a date." }, { status: 400 });
  }
  const distances =
    typeof body.distances === "string" && body.distances.trim()
      ? body.distances.trim().slice(0, 200)
      : "";

  const created = await prisma.teamMeet.create({
    data: { teamId: team.id, name, date, distances },
    select: MEET_SELECT,
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
    return NextResponse.json({ error: "Which meet?" }, { status: 400 });
  }

  // teamId in the filter, so an id from another team deletes nothing.
  const result = await prisma.teamMeet.deleteMany({
    where: { id: body.id, teamId: team.id },
  });

  return NextResponse.json({ ok: true, deleted: result.count });
}
