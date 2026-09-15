// The admin gate, in one place.
//
// One email, read from the environment, compared against the session. It fails
// closed when ADMIN_EMAIL is unset: an unconfigured deployment must refuse
// everyone rather than admit the first person to ask.
//
// Every admin route calls this as the first statement in the handler, and page
// guards (which protect a page, not the data behind it) never substitute for it.

import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";

// Logged once per process, at module load, so a deploy that forgot the env var
// says so in the first log line rather than as a string of 403s nobody can
// explain. The behaviour is unchanged either way: unset still means nobody.
if (!process.env.ADMIN_EMAIL) {
  console.warn("[admin] ADMIN_EMAIL is not set: every admin route and /admin will refuse everyone.");
}

export async function isAdminSession(): Promise<boolean> {
  const session = await getServerSession(authOptions);
  const adminEmail = process.env.ADMIN_EMAIL;
  return Boolean(adminEmail) && session?.user?.email === adminEmail;
}

/** Returns a 403 response to return, or null when the caller may proceed. */
export async function requireAdmin(): Promise<NextResponse | null> {
  if (await isAdminSession()) return null;
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
