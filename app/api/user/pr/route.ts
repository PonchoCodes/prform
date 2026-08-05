import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildDeclaredPrUpdate } from "@/lib/paceSource";

/** Save or replace the athlete's declared PR. */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as any).id;
  const { prDistanceId, prTimeSeconds, prRecency } = await req.json();

  const update = buildDeclaredPrUpdate(prDistanceId, prTimeSeconds, prRecency);
  if (!update.prDistanceId) {
    return NextResponse.json({ error: "That PR doesn't look right." }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: userId },
    // Saving a PR also retires the prompt.
    data: { ...update, prPromptDismissedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}

/** Clear the declared PR, returning the athlete to history-inferred paces. */
export async function DELETE() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await prisma.user.update({
    where: { id: (session.user as any).id },
    data: { prDistanceId: null, prTimeSeconds: null, prRecency: null, prSetOn: null },
  });

  return NextResponse.json({ ok: true });
}
