import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getWorkoutsForDateRange } from "@/lib/workoutDataSource";

// GET /api/workouts/planned
// Returns the 14-day normalized workout window (past + future) with source metadata.
// Used by the Schedule page PLANNED tab and any UI that needs the unified workout feed.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Return 7 days back + 14 days forward so the Schedule page can show PAST tab too
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - 7);
  const endDate = new Date(today);
  endDate.setDate(today.getDate() + 13);

  const { workouts, conflicts } = await getWorkoutsForDateRange(userId, startDate, endDate);

  return NextResponse.json({ workouts, conflicts });
}

// POST /api/workouts/planned — add a planned future workout
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id;

  const body = await req.json();
  if (!body.date || !body.type) {
    return NextResponse.json({ error: "date and type are required" }, { status: 400 });
  }

  const workout = await prisma.workout.create({
    data: {
      userId,
      date: new Date(body.date),
      type: body.type,
      distance: body.distance ? parseFloat(body.distance) : null,
      duration: body.duration ? parseInt(body.duration) : null,
      isTemplate: false,
      isTentative: true,
    },
  });

  return NextResponse.json(workout, { status: 201 });
}
