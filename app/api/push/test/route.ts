import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getPushProvider } from "@/lib/messaging/push";

// "Send me a test notification."
//
// This is the one send in the app that does not go through sendMessage, and
// the exemption is deliberate rather than an oversight — the rule it sits
// outside of is load-bearing, so here is the argument.
//
// The SentMessage ledger exists to cap what WE send an athlete unprompted. Its
// invariant is that no message reaches someone without a row the cap can count.
// This message is not unprompted: it goes to the session user, only when they
// press the button, and only to their own devices. Counting it against their
// daily allowance would mean an athlete testing that notifications work could
// use up the evening question they were testing FOR.
//
// It is also the only way to answer "did it actually arrive on this phone",
// which is the question that matters on iOS, where a subscription can exist and
// still deliver nothing if the app was opened from Safari rather than the home
// screen.
//
// The safety properties that make the exemption safe: no request body, no
// recipient parameter, and the userId comes from the session. There is no
// input to this endpoint at all, so there is nothing to point it at anyone.

export const dynamic = "force-dynamic";

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id as string;

  const provider = getPushProvider();
  if (!provider) {
    return NextResponse.json(
      { error: "Notifications aren't configured on this server yet." },
      { status: 503 },
    );
  }

  const result = await provider.sendNow(
    { channel: "PUSH", userId },
    "Notifications are working. This is what your evening check-in will look like.",
    { tag: "prform-test", url: "/dashboard" },
  );

  if (!result.ok) {
    // The two interesting failures both mean the same thing to the athlete —
    // nothing arrived — but they mean different things to us, so the reason is
    // returned rather than flattened into a generic error.
    return NextResponse.json(
      {
        error:
          result.error === "no_live_subscriptions" || result.error === "all_subscriptions_expired"
            ? "This device isn't subscribed any more. Turn notifications off and on again."
            : "We couldn't send the test notification.",
        reason: result.error,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, detail: result.providerStatus });
}
