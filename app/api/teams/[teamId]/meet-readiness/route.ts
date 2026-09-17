import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { assertCoachAccess } from "@/lib/entitlements";
import { loadMeetReadiness } from "@/lib/team/coachView";

// The next team meet, per athlete: readiness colour, ramp status, one line.
//
// Same contract as ./exceptions. Sleep rows are read inside
// lib/team/coachView.ts and die there; what leaves is the output of
// deriveMeetReadiness, which lib/team/meetReadiness.test.ts holds to the
// coach copy guard. Per-athlete, so it is the paid half and goes through
// assertCoachAccess: a free team gets 402 and keeps the meet on its calendar.

export async function GET(_req: Request, { params }: { params: { teamId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id as string;

  const access = await assertCoachAccess(params.teamId, userId);
  if (!access.ok && access.reason === "not_owner") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!access.ok) {
    return NextResponse.json(
      {
        error: "Meet readiness is part of the team plan.",
        code: "UPGRADE_REQUIRED",
        source: access.entitlement.source,
      },
      { status: 402 },
    );
  }

  const readiness = await loadMeetReadiness(access.team.id, access.athletes);
  if (!readiness) return NextResponse.json({ meet: null });
  return NextResponse.json(readiness);
}
