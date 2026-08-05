import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** Dismiss the "add your PR" prompt for an existing user, permanently. */
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await prisma.user.update({
    where: { id: (session.user as any).id },
    data: { prPromptDismissedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
