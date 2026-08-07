import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateJoinCode, joinCodeExpiry } from "@/lib/team/joinCode";

// Teams: create one (becoming its owner), and list where you stand.
//
// Anyone signed in may create a team. There is no role to be granted, no
// application, no approval — a captain organizing six people needs a roster as
// much as a salaried coach does, and gatekeeping it would only mean the person
// who actually does the organizing cannot.
//
// What is NOT open: there is no directory, no browse, no search. A team is
// reachable by join code alone, which is what keeps a roster of minors from
// being an enumerable list.
//
// And there is deliberately no endpoint anywhere under /api/teams that writes
// a membership for anyone but the session user. An owner gets a join code, and
// what happens next is the athlete's act, on the athlete's account, past the
// consent screen — many of these athletes are minors, and "the coach typed
// their email in" must not be a thing this API can express.

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id as string;

  const [owned, memberships] = await Promise.all([
    prisma.team.findMany({
      where: { ownerId: userId },
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
    // Every team they are ON, which is a different set from the teams they
    // own and may overlap it. Both directions are normal: someone can run the
    // distance squad, be a member of it, and also be on a track team somebody
    // else runs.
    prisma.teamMembership.findMany({
      where: { userId, status: "ACTIVE" },
      select: {
        id: true,
        joinedAt: true,
        // The athlete's own view of a team never includes the join code —
        // handing every member a working invite would make the roster
        // effectively public.
        team: { select: { id: true, name: true, sport: true, season: true, ownerId: true } },
      },
      orderBy: { joinedAt: "asc" },
    }),
  ]);

  return NextResponse.json({
    owned: owned.map((t) => ({
      id: t.id,
      name: t.name,
      sport: t.sport,
      season: t.season,
      joinCode: t.joinCode,
      joinCodeExpiresAt: t.joinCodeExpiresAt,
      athleteCount: t._count.memberships,
    })),
    memberships: memberships.map((m) => ({
      id: m.id,
      joinedAt: m.joinedAt,
      team: {
        id: m.team.id,
        name: m.team.name,
        sport: m.team.sport,
        season: m.team.season,
      },
      // So the UI can mark "your own team" on a membership rather than listing
      // it twice with no explanation. A boolean, not the owner's identity.
      ownedByYou: m.team.ownerId === userId,
    })),
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
      ownerId: userId,
      joinCode: generateJoinCode(),
      joinCodeExpiresAt: joinCodeExpiry(),
    },
    select: { id: true, name: true, season: true, joinCode: true, joinCodeExpiresAt: true },
  });

  return NextResponse.json(team, { status: 201 });
}
