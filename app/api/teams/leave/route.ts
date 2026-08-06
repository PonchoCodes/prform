import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// An athlete leaves a team. Session user only — same one-identity rule as
// joining. The row flips to LEFT rather than being deleted so the consent
// record survives; the coach's exception list excludes non-ACTIVE members,
// so departure removes their status from the coach's view immediately, which
// is what the consent screen promises.

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id as string;

  const body = await req.json().catch(() => ({}));
  if (typeof body.teamId !== "string") {
    return NextResponse.json({ error: "Which team?" }, { status: 400 });
  }

  const result = await prisma.teamMembership.updateMany({
    where: { teamId: body.teamId, userId, status: "ACTIVE" },
    data: { status: "LEFT" },
  });

  if (result.count === 0) {
    return NextResponse.json({ error: "You're not on that team." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
