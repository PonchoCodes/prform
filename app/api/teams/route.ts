import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateJoinCode, joinCodeExpiry } from "@/lib/team/joinCode";

// Teams: create one (becoming its coach), and list where you stand.
//
// There is deliberately no endpoint anywhere under /api/teams that writes a
// membership for anyone but the session user. A coach gets a join code, and
// what happens next is the athlete's act, on the athlete's account, past the
// consent screen — many of these athletes are minors, and "the coach typed
// their email in" must not be a thing this API can express.

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id as string;

  const [coached, memberships] = await Promise.all([
    prisma.team.findMany({
      where: { coachId: userId },
      select: {
        id: true,
        name: true,
        sport: true,
        season: true,
        joinCode: true,
        joinCodeExpiresAt: true,
        _count: { select: { memberships: { where: { status: "ACTIVE" } } } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.teamMembership.findMany({
      where: { userId, status: "ACTIVE" },
      select: {
        id: true,
        joinedAt: true,
        // The athlete's own view of a team never includes the join code —
        // handing every member a working invite would make the roster
        // effectively public.
        team: { select: { id: true, name: true, sport: true, season: true } },
      },
      orderBy: { joinedAt: "asc" },
    }),
  ]);

  return NextResponse.json({
    coached: coached.map((t) => ({
      id: t.id,
      name: t.name,
      sport: t.sport,
      season: t.season,
      joinCode: t.joinCode,
      joinCodeExpiresAt: t.joinCodeExpiresAt,
      athleteCount: t._count.memberships,
    })),
    memberships,
  });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id as string;

  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (name.length < 2 || name.length > 80) {
    return NextResponse.json({ error: "Team name must be 2–80 characters." }, { status: 400 });
  }
  const season = typeof body.season === "string" && body.season.trim() ? body.season.trim() : null;

  const team = await prisma.team.create({
    data: {
      name,
      sport: "track",
      season,
      coachId: userId,
      joinCode: generateJoinCode(),
      joinCodeExpiresAt: joinCodeExpiry(),
    },
    select: { id: true, name: true, season: true, joinCode: true, joinCodeExpiresAt: true },
  });

  return NextResponse.json(team, { status: 201 });
}
