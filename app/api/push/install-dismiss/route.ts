import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// "Not now" on the install notice.
//
// Recorded on the user rather than in localStorage so that dismissing it on a
// phone also silences it on a laptop. A notice that has to be dismissed once
// per device is one people stop reading and start swatting, and this one has a
// job to do during the pilot.

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id as string;

  await prisma.user.update({
    where: { id: userId },
    data: { installPromptDismissedAt: new Date() },
    select: { id: true },
  });

  return NextResponse.json({ ok: true });
}
