import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isValidRpe } from "@/lib/trainingLoad";

/**
 * Session RPE from a request body: an integer 1–10 or nothing. Anything else
 * is dropped rather than stored — a 0 or an 11 would silently corrupt the
 * training load it feeds.
 */
function rpeFrom(body: Record<string, unknown>): number | null {
  if (body.effort == null || body.effort === "") return null;
  const rpe = typeof body.effort === "number" ? body.effort : parseInt(String(body.effort), 10);
  return isValidRpe(rpe) ? rpe : null;
}

const QUALITY_VALUES = new Set(["NAILED_IT", "FINE", "ROUGH"]);

function qualityFrom(body: Record<string, unknown>): "NAILED_IT" | "FINE" | "ROUGH" | null {
  return typeof body.quality === "string" && QUALITY_VALUES.has(body.quality)
    ? (body.quality as "NAILED_IT" | "FINE" | "ROUGH")
    : null;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id;

  const workouts = await prisma.workout.findMany({
    where: { userId },
    orderBy: { date: "asc" },
  });
  return NextResponse.json(workouts);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id;

  const body = await req.json();
  const workout = await prisma.workout.create({
    data: {
      userId,
      date: new Date(body.date),
      type: body.type,
      distance: body.distance ? parseFloat(body.distance) : null,
      duration: body.duration ? parseInt(body.duration) : null,
      effort: rpeFrom(body),
      quality: qualityFrom(body),
      isTemplate: body.isTemplate ?? false,
      dayOfWeek: body.dayOfWeek ?? null,
      isTentative: body.isTentative ?? false,
      manualOverride: body.manualOverride ?? false,
    },
  });
  return NextResponse.json(workout);
}

export async function PUT(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id;

  const body = await req.json();
  const workout = await prisma.workout.update({
    where: { id: body.id, userId },
    // Partial update: a field that isn't in the body isn't touched. The old
    // behaviour nulled distance and effort on any PUT that omitted them, so
    // dismissing a conflict quietly erased the workout's own data.
    data: {
      ...(body.type !== undefined && { type: body.type }),
      ...(body.distance !== undefined && {
        distance: body.distance ? parseFloat(body.distance) : null,
      }),
      ...(body.effort !== undefined && { effort: rpeFrom(body) }),
      ...(body.duration !== undefined && {
        duration: body.duration ? parseInt(body.duration) : null,
      }),
      ...(body.quality !== undefined && { quality: qualityFrom(body) }),
      ...(body.manualOverride !== undefined && { manualOverride: body.manualOverride }),
      ...(body.conflictDismissed !== undefined && { conflictDismissed: body.conflictDismissed }),
      ...(body.isTentative !== undefined && { isTentative: body.isTentative }),
    },
  });
  return NextResponse.json(workout);
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id;

  const { id } = await req.json();
  await prisma.workout.delete({ where: { id, userId } });
  return NextResponse.json({ ok: true });
}
