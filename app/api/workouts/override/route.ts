import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// PUT /api/workouts/override
// Body: { workoutId: string } — marks the manual workout as the authoritative source for its date,
// overriding any Strava activity on the same day.
export async function PUT(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id;

  const { workoutId } = await req.json();
  if (!workoutId) return NextResponse.json({ error: "workoutId required" }, { status: 400 });

  const workout = await prisma.workout.findUnique({ where: { id: workoutId } });
  if (!workout || workout.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updated = await prisma.workout.update({
    where: { id: workoutId },
    data: { manualOverride: true, conflictDismissed: true },
  });

  return NextResponse.json(updated);
}

// DELETE /api/workouts/override
// Body: { workoutId: string } — clears the manual override so Strava data takes precedence again.
export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id;

  const { workoutId } = await req.json();
  if (!workoutId) return NextResponse.json({ error: "workoutId required" }, { status: 400 });

  const workout = await prisma.workout.findUnique({ where: { id: workoutId } });
  if (!workout || workout.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updated = await prisma.workout.update({
    where: { id: workoutId },
    data: { manualOverride: false },
  });

  return NextResponse.json(updated);
}
