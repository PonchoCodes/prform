import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertOwnerOf } from "@/lib/team/guard";
import { createTeamCheckoutSession } from "@/lib/teamCheckout";
import { isTeamTier } from "@/lib/teamBilling";
import { purchaseBlockedReason } from "@/lib/entitlements";

// The list-price path into Stripe Checkout. The pilot path is reached through
// /api/teams/[teamId]/redeem-pilot, which creates its own session at the
// locked price behind a trial.
//
// Only the owner may buy, and only for the team named in the URL: the session
// is created against that team and its subscription id is written back to it,
// which is what stops one purchase from covering two teams.

export async function POST(req: Request, { params }: { params: { teamId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id as string;

  const team = await assertOwnerOf(params.teamId, userId);
  if (!team) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const tier = body.tier;
  if (!isTeamTier(tier)) {
    return NextResponse.json({ error: "Pick a plan." }, { status: 400 });
  }

  // One plan per team, the same rule redeem-pilot applies. A pilot team that
  // opened a list-price checkout would end up with two subscriptions.
  const current = await prisma.team.findUnique({
    where: { id: team.id },
    select: { entitlementSource: true, stripeSubscriptionId: true },
  });
  if (!current || purchaseBlockedReason(current)) {
    return NextResponse.json(
      { error: "This team already has a plan.", code: "ALREADY_ON_PLAN" },
      { status: 409 },
    );
  }

  const result = await createTeamCheckoutSession({
    teamId: team.id,
    ownerId: userId,
    tier,
    path: "PAID",
    baseUrl: new URL(req.url).origin,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ url: result.url });
}
