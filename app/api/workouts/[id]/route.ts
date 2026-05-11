import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id;

  const { id } = params;
  const workout = await prisma.workout.findUnique({ where: { id } });

  if (!workout || workout.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Strava-linked workouts are not deletable from PRform
  if (workout.stravaActivityId) {
    return NextResponse.json({ error: "Strava activities cannot be deleted from PRform" }, { status: 403 });
  }

  await prisma.workout.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
