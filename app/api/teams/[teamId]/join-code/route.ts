import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertOwnerOf } from "@/lib/team/guard";
import { generateJoinCode, joinCodeExpiry } from "@/lib/team/joinCode";

// Mint a fresh join code, killing the old one immediately. Owner only.

export async function POST(_req: Request, { params }: { params: { teamId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id as string;

  const team = await assertOwnerOf(params.teamId, userId);
  if (!team) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const updated = await prisma.team.update({
    where: { id: team.id },
    data: { joinCode: generateJoinCode(), joinCodeExpiresAt: joinCodeExpiry() },
    select: { joinCode: true, joinCodeExpiresAt: true },
  });

  return NextResponse.json(updated);
}
