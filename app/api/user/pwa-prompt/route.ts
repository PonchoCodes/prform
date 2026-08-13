import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// The two answers an athlete can give the install modal.
//
// Kept apart from /api/push/install-dismiss, which records the same word about
// a different prompt. The dashboard strip that route serves stays dismissed
// forever; this modal returns after a week, up to three refusals. Pointing both
// at one column would mean a "not now" on the strip silently spending one of
// the modal's asks, and a support conversation nobody could reconstruct.

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id as string;

  let action: unknown;
  try {
    ({ action } = await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (action === "installed") {
    await prisma.user.update({
      where: { id: userId },
      // Terminal. The show count is deliberately left alone — it counts
      // refusals, and installing is not one.
      data: { pwaPromptState: "INSTALLED" },
      select: { id: true },
    });
    return NextResponse.json({ ok: true, state: "INSTALLED" });
  }

  if (action === "dismissed") {
    // updateMany for its where clause: INSTALLED is terminal, and a dismissal
    // must never walk it back. The race is real — the modal is open, the
    // athlete installs from it, appinstalled writes INSTALLED, and a "not now"
    // tap that was already in flight arrives afterwards. Losing the install
    // there would re-prompt somebody who has the app on their home screen.
    const result = await prisma.user.updateMany({
      where: { id: userId, NOT: { pwaPromptState: "INSTALLED" } },
      data: {
        pwaPromptState: "DISMISSED",
        pwaPromptDismissedAt: new Date(),
        // Incremented in the database rather than read-modify-written here, so
        // two devices answering at once cannot both write 1.
        pwaPromptShowCount: { increment: 1 },
      },
    });
    return NextResponse.json({
      ok: true,
      state: result.count > 0 ? "DISMISSED" : "INSTALLED",
    });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
