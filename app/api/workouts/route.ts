import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
      effort: body.effort ? parseInt(body.effort) : null,
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
    data: {
      type: body.type,
      distance: body.distance ? parseFloat(body.distance) : null,
      effort: body.effort ? parseInt(body.effort) : null,
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
