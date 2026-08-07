import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Marking a stretch of days as away.
//
// Session user only, like everything else that writes on someone's behalf.
// There is no balance to spend and no limit to enforce, so this route is almost
// entirely input validation.

/** A hold longer than this is more likely a typo than a plan. */
const MAX_HOLD_DAYS = 90;

/** "YYYY-MM-DD" to the UTC-midnight instant SleepLog.date uses. */
function toDate(key: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const d = new Date(`${key}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id as string;

  const holds = await prisma.streakHold.findMany({
    where: { userId },
    orderBy: { startsOn: "desc" },
    take: 50,
    select: { id: true, startsOn: true, endsOn: true, reason: true },
  });

  return NextResponse.json({
    holds: holds.map((h) => ({
      id: h.id,
      startsOn: toKey(h.startsOn),
      endsOn: toKey(h.endsOn),
      reason: h.reason,
    })),
  });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id as string;

  const body = await req.json().catch(() => ({}));
  const startsOn = typeof body.startsOn === "string" ? toDate(body.startsOn) : null;
  const endsOn = typeof body.endsOn === "string" ? toDate(body.endsOn) : null;

  if (!startsOn || !endsOn) {
    return NextResponse.json({ error: "Pick a start and an end date." }, { status: 400 });
  }
  if (endsOn < startsOn) {
    return NextResponse.json({ error: "The end date is before the start date." }, { status: 400 });
  }

  const spanDays = Math.round((endsOn.getTime() - startsOn.getTime()) / 86_400_000) + 1;
  if (spanDays > MAX_HOLD_DAYS) {
    return NextResponse.json(
      { error: `A hold can cover at most ${MAX_HOLD_DAYS} days.` },
      { status: 400 },
    );
  }

  const hold = await prisma.streakHold.create({
    data: {
      userId,
      startsOn,
      endsOn,
      reason:
        typeof body.reason === "string" && body.reason.trim()
          ? body.reason.trim().slice(0, 120)
          : null,
    },
    select: { id: true, startsOn: true, endsOn: true, reason: true },
  });

  return NextResponse.json(
    {
      id: hold.id,
      startsOn: toKey(hold.startsOn),
      endsOn: toKey(hold.endsOn),
      reason: hold.reason,
    },
    { status: 201 },
  );
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id as string;

  const body = await req.json().catch(() => ({}));
  if (typeof body.id !== "string") {
    return NextResponse.json({ error: "Which hold?" }, { status: 400 });
  }

  // Scoped by userId as well as id, so an id belonging to someone else deletes
  // nothing rather than being trusted on its own.
  const result = await prisma.streakHold.deleteMany({ where: { id: body.id, userId } });
  if (result.count === 0) {
    return NextResponse.json({ error: "That hold doesn't exist." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
