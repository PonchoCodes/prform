import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { assertCoachAccess } from "@/lib/entitlements";
import { loadTeamTrend } from "@/lib/team/coachView";

// The team trend: eight weeks of compliance, logging and short nights, with
// the team's hard sessions under them, and a per-athlete row for this week.
//
// Sleep rows are read inside lib/team/coachView.ts and die there; the
// payload is what buildTeamTrend returns, which lib/teamTrend.test.ts walks
// through the coach copy guard. Trends are part of the plan
// (lib/entitlements.ts), so the route goes through assertCoachAccess and
// then checks the trends feature itself: the two are the same today, and
// checking the named feature keeps this route correct if they ever diverge.

export async function GET(_req: Request, { params }: { params: { teamId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id as string;

  const access = await assertCoachAccess(params.teamId, userId);
  if (!access.ok && access.reason === "not_owner") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!access.ok || !access.entitlement.features.trends) {
    return NextResponse.json(
      {
        error: "The team trend is part of the team plan.",
        code: "UPGRADE_REQUIRED",
        source: access.entitlement.source,
      },
      { status: 402 },
    );
  }

  return NextResponse.json(await loadTeamTrend(access.team.id, access.athletes));
}
