"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/Button";
import {
  TIERS,
  formatUsd,
  formatRenewalDate,
  paidBillingCycleAnchor,
  renewalDisclosure,
  type TeamTier,
} from "@/lib/teamBilling";

// The page a coach buys from, and the only screen in the app that quotes a
// price.
//
// The renewal sentence sits directly above the submit button, in body text, in
// the same size as everything else around it. Not a tooltip, not behind "see
// terms", not in grey 10px under the fold. It states the date, the amount, and
// that it repeats until cancelled, because that is what the law in California
// and several other states requires and because a charge somebody does not
// expect is a refund and a lost team.
//
// Stripe's own page repeats it above ITS submit button
// (custom_text.submit.message in lib/teamCheckout.ts), so the disclosure
// survives the handoff.

interface OwnedTeam {
  id: string;
  name: string;
  athleteCount: number;
  entitlement: {
    source: "FREE" | "PILOT" | "PAID";
    active: boolean;
    seatLimit: number;
    expiresAt: string | null;
  };
}

function BillingInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { status } = useSession();

  const [teams, setTeams] = useState<OwnedTeam[]>([]);
  const [teamId, setTeamId] = useState<string>(params.get("team") ?? "");
  const [tier, setTier] = useState<TeamTier>("TEAM");
  const [pilotCode, setPilotCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(
    params.get("checkout") === "cancelled" ? "Checkout was cancelled. Nothing was charged." : null,
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/teams")
      .then((r) => r.json())
      .then((data) => {
        const owned: OwnedTeam[] = data.owned ?? [];
        setTeams(owned);
        setTeamId((current) => current || owned[0]?.id || "");
        setLoading(false);
      });
  }, [status]);

  const team = teams.find((t) => t.id === teamId) ?? null;

  const anchor = useMemo(() => paidBillingCycleAnchor(new Date()), []);
  const disclosure = useMemo(
    () =>
      renewalDisclosure({
        tier,
        path: "PAID",
        firstChargeDate: anchor.anchor,
        proratedFirstTerm: true,
      }),
    [tier, anchor],
  );

  const startCheckout = async () => {
    if (!teamId) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/teams/${teamId}/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tier }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.url) {
      setError(data.error ?? "Could not open checkout. Please try again.");
      setBusy(false);
      return;
    }
    window.location.href = data.url;
  };

  const redeemPilot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamId) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/teams/${teamId}/redeem-pilot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: pilotCode }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "That code did not work.");
      setBusy(false);
      return;
    }
    if (data.checkoutUrl) {
      window.location.href = data.checkoutUrl;
      return;
    }
    setNotice("Your pilot is active. Add a card from this page before July 31, 2027.");
    setBusy(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white dark:bg-[#1a1a1a] flex items-center justify-center">
        <p className="font-mono text-sm uppercase tracking-wider text-[#6B6B6B]">Loading…</p>
      </div>
    );
  }

  if (teams.length === 0) {
    return (
      <div className="min-h-screen bg-white dark:bg-[#1a1a1a]">
        <Navbar />
        <div className="max-w-[720px] mx-auto px-6 py-20">
          <h1 className="font-black text-4xl uppercase mb-4 dark:text-[#F5F5F5]">Team Plan</h1>
          <p className="text-sm text-[#6B6B6B] dark:text-[#A0A0A0] mb-8">
            You do not run a team yet. Make one first, then come back.
          </p>
          <Link href="/team/new">
            <Button variant="secondary" size="lg">Create A Team</Button>
          </Link>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-[#1a1a1a]">
      <Navbar />

      <div className="max-w-[720px] mx-auto px-6 py-12">
        <h1 className="font-black text-4xl uppercase mb-8 dark:text-[#F5F5F5]">Coach Tools</h1>

        {notice && (
          <p className="border border-[#E5E5E5] dark:border-[#333] px-4 py-3 text-sm mb-6 dark:text-[#F5F5F5]">
            {notice}
          </p>
        )}

        {teams.length > 1 && (
          <div className="mb-8">
            <label className="block text-xs font-bold uppercase tracking-wider mb-2 dark:text-[#A0A0A0]">
              Team
            </label>
            <select
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
              className="w-full border border-[#E5E5E5] dark:border-[#444] px-4 py-3 text-sm dark:bg-[#2a2a2a] dark:text-[#F5F5F5]"
            >
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {team && (
          <div className="border border-[#E5E5E5] dark:border-[#333] p-6 mb-10">
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] dark:text-[#A0A0A0] mb-2">
              Current Plan
            </p>
            <p className="font-black text-xl uppercase dark:text-[#F5F5F5]">
              {team.entitlement.active ? team.entitlement.source : "Free"}
            </p>
            <p className="font-mono text-xs text-[#6B6B6B] dark:text-[#A0A0A0] mt-2">
              {team.athleteCount} of {team.entitlement.seatLimit} seats used
              {team.entitlement.expiresAt && team.entitlement.active
                ? ` · runs through ${formatRenewalDate(new Date(team.entitlement.expiresAt))}`
                : ""}
            </p>
          </div>
        )}

        {/* ── Tiers ────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-[#E5E5E5] dark:bg-[#333] mb-8">
          {(Object.keys(TIERS) as TeamTier[]).map((key) => {
            const spec = TIERS[key];
            const selected = tier === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setTier(key)}
                aria-pressed={selected}
                className={`text-left p-6 transition-colors ${
                  selected
                    ? "bg-[#0A0A0A] text-white dark:bg-[#F5F5F5] dark:text-[#0A0A0A]"
                    : "bg-white dark:bg-[#242424] dark:text-[#F5F5F5]"
                }`}
              >
                <p className="font-black text-lg uppercase">{spec.label}</p>
                <p className="font-mono font-black text-3xl mt-2">{formatUsd(spec.listCents)}</p>
                <p className="font-mono text-xs mt-1 opacity-70">per year</p>
                <p className="font-mono text-xs mt-4 opacity-70">
                  Up to {spec.seatLimit} athletes
                </p>
              </button>
            );
          })}
        </div>

        {error && (
          <p className="text-xs font-bold uppercase tracking-wider text-[#FF4444] mb-4">{error}</p>
        )}

        {/* The disclosure. Directly above the button, same type size as the
            rest of the page, never collapsed. */}
        <div className="border border-[#0A0A0A] dark:border-[#F5F5F5] p-5 mb-4">
          <p className="text-sm leading-relaxed dark:text-[#F5F5F5]">{disclosure}</p>
        </div>

        <Button
          variant="secondary"
          size="lg"
          className="w-full"
          disabled={busy || !teamId}
          onClick={startCheckout}
        >
          {busy ? "Opening checkout…" : `Subscribe To ${TIERS[tier].label}`}
        </Button>

        {/* ── Pilot code ───────────────────────────────────────────────── */}
        <div className="border-t border-[#E5E5E5] dark:border-[#333] mt-14 pt-10">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] dark:text-[#A0A0A0] mb-3">
            Pilot Code
          </p>
          <p className="text-sm text-[#6B6B6B] dark:text-[#A0A0A0] mb-4">
            A pilot code unlocks the full team plan through July 31, 2027 and locks your
            renewal at {formatUsd(TIERS.TEAM.lockedCents)} a year.
          </p>
          <form onSubmit={redeemPilot} className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={pilotCode}
              onChange={(e) => setPilotCode(e.target.value)}
              placeholder="XXXXXXXX"
              className="flex-1 border border-[#E5E5E5] dark:border-[#444] px-4 py-3 font-mono text-sm tracking-[0.2em] uppercase focus:outline-none focus:border-[#0A0A0A] dark:focus:border-[#F5F5F5] dark:bg-[#2a2a2a] dark:text-[#F5F5F5]"
            />
            <Button type="submit" variant="ghost" size="lg" disabled={busy || !pilotCode}>
              Redeem
            </Button>
          </form>
        </div>
      </div>

      <Footer />
    </div>
  );
}

export default function TeamBillingPage() {
  return (
    <Suspense fallback={null}>
      <BillingInner />
    </Suspense>
  );
}
