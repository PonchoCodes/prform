import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cleanJoinCode, isWellFormedJoinCode } from "@/lib/team/joinCode";
import { TEAM_CONSENT_TEXT } from "@/lib/team/consent";

// The one and only way onto a roster: the athlete, on their own session,
// with a valid code, past the consent screen.
//
// The membership row is written for the SESSION user. There is no userId in
// the request contract, and lib/team/guard.test.ts fails the build if one
// ever appears in this file — that is the API-level enforcement of "a coach
// can never enrol another person".

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id as string;

  const body = await req.json().catch(() => ({}));

  const code = typeof body.code === "string" ? cleanJoinCode(body.code) : "";
  if (!isWellFormedJoinCode(code)) {
    return NextResponse.json({ error: "That doesn't look like a join code." }, { status: 400 });
  }

  // Consent is an explicit boolean the UI sets only when the box is ticked.
  // The text recorded is the server's constant, not anything posted — a
  // modified client cannot record a wording that was never shown.
  if (body.consent !== true) {
    return NextResponse.json(
      { error: "You have to accept what your coach can and cannot see." },
      { status: 400 },
    );
  }

  const team = await prisma.team.findUnique({
    where: { joinCode: code },
    select: { id: true, name: true, coachId: true, joinCodeExpiresAt: true },
  });

  // One message for "no such code" and "expired code": a join code is a
  // secret, and distinguishing the two confirms which strings are live codes.
  if (!team || team.joinCodeExpiresAt < new Date()) {
    return NextResponse.json(
      { error: "That code isn't valid. Ask your coach for a fresh one." },
      { status: 404 },
    );
  }

  if (team.coachId === userId) {
    return NextResponse.json({ error: "You coach this team." }, { status: 400 });
  }

  const now = new Date();
  const membership = await prisma.teamMembership.upsert({
    where: { teamId_userId: { teamId: team.id, userId } },
    // Re-joining after leaving re-consents: status back to ACTIVE and a fresh
    // consent record. The original consentAt is overwritten deliberately —
    // what governs is what they agreed to most recently.
    update: { status: "ACTIVE", consentAt: now, consentText: TEAM_CONSENT_TEXT },
    create: {
      teamId: team.id,
      userId,
      consentAt: now,
      consentText: TEAM_CONSENT_TEXT,
    },
    select: { id: true, joinedAt: true, team: { select: { id: true, name: true } } },
  });

  return NextResponse.json({ ok: true, membership });
}
