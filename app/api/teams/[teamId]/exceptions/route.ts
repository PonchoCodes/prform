import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { assertCoachAccess } from "@/lib/entitlements";
import { loadAttention } from "@/lib/team/coachView";

// The team dashboard's data: an exception list, not a roster table.
//
// What leaves this endpoint per athlete is a name, a color, a counts-based
// trend sentence, and a recommendation — the exact set the consent screen
// promises, derived in lib/team/status.ts. Raw sleep rows are read inside
// lib/team/coachView.ts and die there. No bedtime, wake time, hours value,
// pace, or message can appear in the response shape, and there is no sort
// order or score to compare athletes against each other.
//
// The guard is assertCoachAccess, which composes assertOwnerOf with the
// entitlement resolver and the consent filter. Per-athlete status is the paid
// half of the team product, so a free team gets 402 here and keeps its
// leaderboard; a lapsed team gets the same answer and keeps every member.

export async function GET(_req: Request, { params }: { params: { teamId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id as string;

  // An owner who also joined their own team appears here like anyone else.
  // That is their own readiness in their own list — no new disclosure — and
  // omitting it would give a captain a roster count that never matches the
  // number of people actually on the team.
  const access = await assertCoachAccess(params.teamId, userId);
  if (!access.ok && access.reason === "not_owner") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!access.ok) {
    return NextResponse.json(
      {
        error: "Per-athlete status is part of the team plan.",
        code: "UPGRADE_REQUIRED",
        source: access.entitlement.source,
      },
      { status: 402 },
    );
  }

  const attention = await loadAttention(access.athletes);

  return NextResponse.json({
    teamName: access.team.name,
    rosterSize: attention.rosterSize,
    onTrack: attention.onTrack,
    // Red before amber so the top of the list is the athlete to talk to
    // first. The membership id is the handle a Nudge carries back: scoped to
    // this team by construction, and resolved against the roster again
    // before the nudge route acts on it.
    exceptions: attention.exceptions.map((e) => ({
      membershipId: e.membershipId,
      name: e.name,
      color: e.color as "amber" | "red",
      trend: e.trend,
      recommendation: e.recommendation,
    })),
  });
}
