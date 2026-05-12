import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createHmac } from "crypto";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const rawState = searchParams.get("state") ?? "";

  if (error || !code) {
    return NextResponse.redirect(new URL(`/strava?error=access_denied`, req.url));
  }

  // Extract userId and returnTo from the signed state embedded by /api/strava/connect.
  // This avoids relying on the session cookie surviving a cross-site OAuth redirect.
  let userId: string | null = null;
  let returnTo = "/strava";

  const dot = rawState.lastIndexOf(".");
  if (dot > 0) {
    const payload = rawState.slice(0, dot);
    const sig = rawState.slice(dot + 1);
    const expected = createHmac("sha256", process.env.NEXTAUTH_SECRET!).update(payload).digest("hex");
    if (sig === expected) {
      try {
        const data = JSON.parse(Buffer.from(payload, "base64url").toString());
        userId = data.userId ?? null;
        returnTo = data.returnTo ?? "/strava";
      } catch {
        // malformed payload — fall through to session fallback
      }
    }
  }

  // Fallback: read session (handles any old-format state or direct navigation)
  if (!userId) {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.redirect(new URL("/strava?error=session_expired", req.url));
    }
    userId = (session.user as any).id;
    returnTo = rawState.startsWith("/") ? rawState : "/strava";
  }

  // Narrowing guard — both paths above either set userId or return early
  if (!userId) {
    return NextResponse.redirect(new URL("/strava?error=session_expired", req.url));
  }

  try {
    const tokenRes = await fetch("https://www.strava.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      console.error("[strava/callback] token exchange failed", await tokenRes.text());
      return NextResponse.redirect(new URL("/strava?error=token_exchange", req.url));
    }

    const tokenData = await tokenRes.json();

    await prisma.user.update({
      where: { id: userId },
      data: {
        stravaAccessToken: tokenData.access_token,
        stravaRefreshToken: tokenData.refresh_token,
        stravaTokenExpiry: new Date(tokenData.expires_at * 1000),
        stravaAthleteId: String(tokenData.athlete?.id ?? ""),
        stravaConnected: true,
      },
    });

    // Register webhook subscription (best-effort; don't block on failure).
    // Origin from the live request — Strava will call our webhook back at the
    // same deployment that handled this callback.
    const baseUrl = new URL(req.url).origin;
    if (baseUrl && process.env.STRAVA_WEBHOOK_VERIFY_TOKEN) {
      fetch("https://www.strava.com/api/v3/push_subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: process.env.STRAVA_CLIENT_ID,
          client_secret: process.env.STRAVA_CLIENT_SECRET,
          callback_url: `${baseUrl}/api/strava/webhook`,
          verify_token: process.env.STRAVA_WEBHOOK_VERIFY_TOKEN,
        }),
      })
        .then((r) => r.json())
        .then((sub) => {
          if (sub?.id) {
            return prisma.user.update({
              where: { id: userId! },
              data: { stravaWebhookSubscriptionId: String(sub.id) },
            });
          }
        })
        .catch(() => {});
    }
  } catch (err) {
    console.error("[strava/callback]", err);
    return NextResponse.redirect(new URL("/strava?error=callback_failed", req.url));
  }

  const dest = new URL(returnTo, req.url);
  dest.searchParams.set("connected", "1");
  return NextResponse.redirect(dest);
}
