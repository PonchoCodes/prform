import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function requiresSubscription(): Promise<
  { userId: string } | NextResponse
> {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = (session.user as any).id as string;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { subscriptionStatus: true },
  });

  const status = user?.subscriptionStatus;
  if (status !== "trialing" && status !== "active") {
    return NextResponse.json(
      { error: "Subscription required" },
      { status: 403 }
    );
  }

  return { userId };
}
