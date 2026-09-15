import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin";
import { generatePilotCode } from "@/lib/pilotCodes";
import { PILOT_EXPIRES_AT } from "@/lib/teamBilling";

// Pilot codes are cut by hand, one per team, and this is the only route that
// makes them. Admin-gated for the obvious reason: a code is a year of the paid
// product at a locked price.

export const dynamic = "force-dynamic";

/** How many times to retry a code collision before giving up. */
const CODE_ATTEMPTS = 5;

export async function GET() {
  const forbidden = await requireAdmin();
  if (forbidden) return forbidden;

  const codes = await prisma.pilotCode.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      code: true,
      label: true,
      redeemedAt: true,
      redeemedByUserId: true,
      expiresAt: true,
      createdAt: true,
      redeemedByTeam: {
        select: {
          id: true,
          name: true,
          // The card-missing flag below. A redeemed pilot with no subscription
          // is a team that will stop dead on the renewal date rather than
          // renew, and this list is the only place that is visible.
          stripeSubscriptionId: true,
          subscriptionStatus: true,
          _count: { select: { memberships: { where: { status: "ACTIVE" } } } },
        },
      },
    },
  });

  return NextResponse.json({
    codes: codes.map((c) => ({
      id: c.id,
      code: c.code,
      label: c.label,
      createdAt: c.createdAt,
      expiresAt: c.expiresAt,
      redeemedAt: c.redeemedAt,
      team: c.redeemedByTeam
        ? {
            id: c.redeemedByTeam.id,
            name: c.redeemedByTeam.name,
            athleteCount: c.redeemedByTeam._count.memberships,
            subscriptionStatus: c.redeemedByTeam.subscriptionStatus,
          }
        : null,
      cardMissing: Boolean(c.redeemedAt) && !c.redeemedByTeam?.stripeSubscriptionId,
    })),
  });
}

export async function POST(req: Request) {
  const forbidden = await requireAdmin();
  if (forbidden) return forbidden;

  const body = await req.json().catch(() => ({}));
  const label = typeof body.label === "string" && body.label.trim() ? body.label.trim().slice(0, 120) : null;

  for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt++) {
    try {
      const created = await prisma.pilotCode.create({
        data: { code: generatePilotCode(), label, expiresAt: PILOT_EXPIRES_AT },
        select: { id: true, code: true, label: true, expiresAt: true, createdAt: true },
      });
      return NextResponse.json(created, { status: 201 });
    } catch (e: any) {
      // P2002 is the unique violation on `code`. Anything else is a real error.
      if (e?.code !== "P2002") throw e;
    }
  }

  return NextResponse.json({ error: "Could not generate a unique code." }, { status: 500 });
}
