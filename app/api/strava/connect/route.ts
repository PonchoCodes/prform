import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clientId = process.env.STRAVA_CLIENT_ID;
  const appUrl = process.env.NEXTAUTH_URL_PRODUCTION ?? process.env.NEXTAUTH_URL;
  const redirectUri = process.env.STRAVA_REDIRECT_URI ?? `${appUrl}/api/strava/callback`;

  // Allow callers to pass a returnTo path (e.g. /onboarding?step=4) so the
  // callback can redirect back to the right place after OAuth completes.
  const { searchParams } = new URL(req.url);
  const returnTo = searchParams.get("returnTo") ?? "/strava";

  const params = new URLSearchParams({
    client_id: clientId!,
    response_type: "code",
    redirect_uri: redirectUri,
    approval_prompt: "force",
    scope: "activity:read_all",
    state: returnTo,
  });

  return NextResponse.redirect(`https://www.strava.com/oauth/authorize?${params.toString()}`);
}
