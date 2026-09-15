import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertOwnerOf } from "@/lib/team/guard";
import { cleanPilotCode, isWellFormedPilotCode } from "@/lib/pilotCodes";
import { createTeamCheckoutSession } from "@/lib/teamCheckout";
import { TEAM_SEAT_LIMIT, purchaseBlockedReason } from "@/lib/entitlements";

// Redeeming a pilot code, exactly once, for exactly one team.
//
// ── The race, and why the write is shaped the way it is ─────────────────────
//
// Two coaches given the same code, tapping at the same moment, must not both
// come away with a pilot. A read-then-write cannot prevent that: both reads
// see an unredeemed code and both writes succeed. So the claim is a single
// conditional UPDATE, `WHERE redeemedByTeamId IS NULL`, and the row count it
// reports is the answer. Zero rows means somebody else got there first, and
// that is a 409, not a retry.
//
// PilotCode.redeemedByTeamId is also unique at the schema level, which catches
// the same collision from the other side if this logic is ever rewritten.

export async function POST(req: Request, { params }: { params: { teamId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id as string;

  const team = await assertOwnerOf(params.teamId, userId);
  if (!team) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const code = typeof body.code === "string" ? cleanPilotCode(body.code) : "";
  if (!isWellFormedPilotCode(code)) {
    return NextResponse.json({ error: "That doesn't look like a pilot code." }, { status: 400 });
  }

  // One plan per team. Checked before the code is claimed, so a refused
  // attempt never burns the code. See purchaseBlockedReason.
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

  const now = new Date();

  let redeemed: { expiresAt: Date } | null = null;
  try {
    redeemed = await prisma.$transaction(async (tx) => {
      // The claim. Every condition that makes a code usable is in this WHERE:
      // it exists, nobody holds it, and it has not expired.
      const claim = await tx.pilotCode.updateMany({
        where: { code, redeemedByTeamId: null, expiresAt: { gt: now } },
        data: { redeemedByTeamId: team.id, redeemedByUserId: userId, redeemedAt: now },
      });
      if (claim.count === 0) return null;

      const row = await tx.pilotCode.findUnique({
        where: { code },
        select: { expiresAt: true },
      });
      if (!row) return null;

      await tx.team.update({
        where: { id: team.id },
        data: {
          entitlementSource: "PILOT",
          entitlementExpiresAt: row.expiresAt,
          seatLimit: TEAM_SEAT_LIMIT,
          // No price is stored here. The locked price is TIERS.TEAM.lockedCents
          // and the Stripe price behind STRIPE_PRICE_TEAM_LOCKED; the renewal
          // notice derives the quoted amount from the same TIERS entry.
        },
      });

      return { expiresAt: row.expiresAt };
    });
  } catch (e: any) {
    // The unique constraint on redeemedByTeamId: this team already holds a
    // pilot code. Same answer as losing the race.
    if (e?.code === "P2002") {
      return NextResponse.json(
        { error: "That code has already been used.", code: "ALREADY_REDEEMED" },
        { status: 409 },
      );
    }
    throw e;
  }

  if (!redeemed) {
    // One message for used, expired and non-existent. A pilot code is a secret,
    // and telling someone which of the three it is confirms live codes.
    return NextResponse.json(
      { error: "That code has already been used.", code: "ALREADY_REDEEMED" },
      { status: 409 },
    );
  }

  // The pilot is live now, card or no card. Checkout is the next step rather
  // than a condition of it. A coach who bounces off the Stripe page keeps
  // their pilot and shows up in the admin list as card-missing, which is a
  // problem to chase rather than a reason to have blocked them at redemption.
  const origin = new URL(req.url).origin;
  const checkout = await createTeamCheckoutSession({
    teamId: team.id,
    ownerId: userId,
    tier: "TEAM",
    path: "PILOT",
    baseUrl: origin,
  });

  return NextResponse.json({
    ok: true,
    entitlementExpiresAt: redeemed.expiresAt,
    seatLimit: TEAM_SEAT_LIMIT,
    checkoutUrl: checkout.ok ? checkout.url : null,
    checkoutError: checkout.ok ? null : checkout.error,
  });
}
