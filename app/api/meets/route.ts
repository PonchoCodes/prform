import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id;

  const meets = await prisma.meet.findMany({
    where: { userId },
    orderBy: { date: "asc" },
  });
  return NextResponse.json(meets);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id;

  const body = await req.json();
  const meet = await prisma.meet.create({
    data: {
      userId,
      name: body.name,
      date: new Date(body.date),
      distances: body.distances,
      priority: body.priority,
      raceTime: body.raceTime || null,
      primaryEvent: body.primaryEvent || null,
      personalBest: body.personalBest || null,
      recentBest: body.recentBest || null,
      personalBestUnit: body.personalBestUnit || null,
    },
  });
  return NextResponse.json(meet);
}

export async function PUT(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id;

  const body = await req.json();
  const meet = await prisma.meet.update({
    where: { id: body.id, userId },
    data: {
      name: body.name,
      date: new Date(body.date),
      distances: body.distances,
      priority: body.priority,
      raceTime: body.raceTime || null,
      primaryEvent: body.primaryEvent || null,
      personalBest: body.personalBest || null,
      recentBest: body.recentBest || null,
      personalBestUnit: body.personalBestUnit || null,
    },
  });
  return NextResponse.json(meet);
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id;

  const { id } = await req.json();
  await prisma.meet.delete({ where: { id, userId } });
  return NextResponse.json({ ok: true });
}
