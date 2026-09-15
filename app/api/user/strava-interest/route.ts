import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// "Tell me when Strava sync is available."
//
// It sets a flag and returns. There is no confirmation modal, no position in
// a line, and nothing that implies an order or a date, because there is no
// queue: eligibility is assigned by hand from the admin page, and inventing a
// line would be inventing a promise about when their turn comes.

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id as string;

  await prisma.user.update({
    where: { id: userId },
    data: { stravaInterest: true },
  });

  return NextResponse.json({ ok: true, interest: true });
}
