import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertOwnerOf } from "@/lib/team/guard";
import { isValidTimeZone } from "@/lib/messaging/time";

// The two settings a team has: whether the Monday digest goes out, and the
// zone it goes out in. Owner only. Nothing here touches billing or the
// roster; a wrong value costs a coach an email, not an athlete anything.

export async function PATCH(req: Request, { params }: { params: { teamId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id as string;

  const team = await assertOwnerOf(params.teamId, userId);
  if (!team) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const data: { digestEnabled?: boolean; timezone?: string } = {};

  if (typeof body.digestEnabled === "boolean") data.digestEnabled = body.digestEnabled;
  if (typeof body.timezone === "string") {
    if (!isValidTimeZone(body.timezone)) {
      return NextResponse.json({ error: "Unknown time zone." }, { status: 400 });
    }
    data.timezone = body.timezone;
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  }

  const updated = await prisma.team.update({
    where: { id: team.id },
    data,
    select: { id: true, digestEnabled: true, timezone: true },
  });

  return NextResponse.json(updated);
}
