"use client";
import { useEffect, useState } from "react";

// The two things run by hand: pilot codes, and who gets Strava sync.
//
// Both are lists with one action each. There is no approval flow here any more
// and nothing on this page decides whether somebody may use PRform, because
// nothing does.

interface PilotCodeRow {
  id: string;
  code: string;
  label: string | null;
  createdAt: string;
  expiresAt: string;
  redeemedAt: string | null;
  team: { id: string; name: string; athleteCount: number; subscriptionStatus: string | null } | null;
  cardMissing: boolean;
}

interface StravaUserRow {
  id: string;
  name: string | null;
  email: string;
  stravaInterest: boolean;
  stravaEligible: boolean;
  stravaConnected: boolean;
  createdAt: string;
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function AdminConsole() {
  const [codes, setCodes] = useState<PilotCodeRow[]>([]);
  const [users, setUsers] = useState<StravaUserRow[]>([]);
  const [stravaCap, setStravaCap] = useState<{ connectedCount: number; cap: number } | null>(null);
  const [label, setLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const [codesRes, stravaRes] = await Promise.all([
      fetch("/api/admin/pilot-codes"),
      fetch("/api/admin/strava"),
    ]);
    if (!codesRes.ok || !stravaRes.ok) {
      setError("Failed to load.");
      setLoading(false);
      return;
    }
    const codesData = await codesRes.json();
    const stravaData = await stravaRes.json();
    setCodes(codesData.codes ?? []);
    setUsers(stravaData.users ?? []);
    setStravaCap({ connectedCount: stravaData.connectedCount, cap: stravaData.cap });
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const createCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);
    const res = await fetch("/api/admin/pilot-codes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: label || null }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Could not create a code.");
    } else {
      setLabel("");
      await load();
    }
    setCreating(false);
  };

  const toggleEligible = async (userId: string, eligible: boolean) => {
    setUsers((rows) => rows.map((u) => (u.id === userId ? { ...u, stravaEligible: eligible } : u)));
    const res = await fetch("/api/admin/strava", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, eligible }),
    });
    if (!res.ok) {
      setError("Could not change that.");
      await load();
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white dark:bg-[#1a1a1a] flex items-center justify-center">
        <p className="font-mono text-sm uppercase tracking-wider text-[#6B6B6B]">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-[#1a1a1a] px-6 py-12">
      <div className="max-w-[1000px] mx-auto">
        <h1 className="font-black text-4xl uppercase mb-10 dark:text-[#F5F5F5]">Admin</h1>

        {error && (
          <p className="text-xs font-bold uppercase tracking-wider text-[#FF4444] mb-6">{error}</p>
        )}

        {/* ── Pilot codes ─────────────────────────────────────────────── */}
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] dark:text-[#A0A0A0] mb-3">
          Pilot Codes
        </p>

        <form onSubmit={createCode} className="flex flex-col sm:flex-row gap-2 mb-6">
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Andover XC, Coach Smith"
            className="flex-1 border border-[#E5E5E5] dark:border-[#444] px-4 py-3 text-sm focus:outline-none focus:border-[#0A0A0A] dark:focus:border-[#F5F5F5] dark:bg-[#2a2a2a] dark:text-[#F5F5F5]"
          />
          <button
            type="submit"
            disabled={creating}
            className="bg-[#0A0A0A] text-white dark:bg-[#F5F5F5] dark:text-[#0A0A0A] font-bold text-xs uppercase tracking-widest px-6 py-3 disabled:opacity-40"
          >
            {creating ? "Generating…" : "Generate Code"}
          </button>
        </form>

        <div className="border border-[#E5E5E5] dark:border-[#333] divide-y divide-[#E5E5E5] dark:divide-[#333] mb-14">
          {codes.length === 0 && (
            <p className="px-4 py-6 font-mono text-xs text-[#6B6B6B] dark:text-[#A0A0A0]">
              No codes yet.
            </p>
          )}
          {codes.map((c) => (
            <div key={c.id} className="px-4 py-4 flex flex-wrap items-center gap-x-6 gap-y-2">
              <span className="font-mono font-black text-lg tracking-[0.15em] dark:text-[#F5F5F5]">
                {c.code}
              </span>
              <span className="text-sm text-[#6B6B6B] dark:text-[#A0A0A0] flex-1 min-w-[160px]">
                {c.label ?? "No label"}
              </span>
              <span className="font-mono text-xs text-[#6B6B6B] dark:text-[#A0A0A0]">
                {c.redeemedAt
                  ? `${c.team?.name ?? "Redeemed"} · ${c.team?.athleteCount ?? 0} athletes · ${formatDate(c.redeemedAt)}`
                  : `Unused · expires ${formatDate(c.expiresAt)}`}
              </span>
              {c.cardMissing && (
                <span className="font-bold text-[10px] uppercase tracking-widest bg-[#E8FF00] text-[#0A0A0A] px-2 py-1">
                  Card Missing
                </span>
              )}
            </div>
          ))}
        </div>

        {/* ── Strava eligibility ──────────────────────────────────────── */}
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] dark:text-[#A0A0A0] mb-3">
          Strava
        </p>
        {stravaCap && (
          <p className="font-mono text-xs text-[#6B6B6B] dark:text-[#A0A0A0] mb-4">
            {stravaCap.connectedCount} of {stravaCap.cap} connected athletes on the current tier.
          </p>
        )}

        <div className="border border-[#E5E5E5] dark:border-[#333] divide-y divide-[#E5E5E5] dark:divide-[#333]">
          {users.length === 0 && (
            <p className="px-4 py-6 font-mono text-xs text-[#6B6B6B] dark:text-[#A0A0A0]">
              Nobody has asked yet.
            </p>
          )}
          {users.map((u) => (
            <div key={u.id} className="px-4 py-4 flex flex-wrap items-center gap-x-6 gap-y-2">
              <span className="font-bold text-sm dark:text-[#F5F5F5] min-w-[120px]">
                {u.name ?? "Unnamed"}
              </span>
              <span className="font-mono text-xs text-[#6B6B6B] dark:text-[#A0A0A0] flex-1 min-w-[180px]">
                {u.email}
              </span>
              <span className="font-mono text-[10px] uppercase tracking-widest text-[#6B6B6B] dark:text-[#A0A0A0]">
                {u.stravaConnected ? "Connected" : u.stravaInterest ? "Asked" : "Eligible"}
              </span>
              <button
                onClick={() => toggleEligible(u.id, !u.stravaEligible)}
                aria-pressed={u.stravaEligible}
                className={`font-bold text-[10px] uppercase tracking-widest px-4 py-2 border transition-colors ${
                  u.stravaEligible
                    ? "bg-[#0A0A0A] text-white border-[#0A0A0A] dark:bg-[#F5F5F5] dark:text-[#0A0A0A] dark:border-[#F5F5F5]"
                    : "border-[#E5E5E5] dark:border-[#444] text-[#6B6B6B] dark:text-[#A0A0A0] hover:border-[#0A0A0A] dark:hover:border-[#F5F5F5]"
                }`}
              >
                {u.stravaEligible ? "Eligible" : "Not Eligible"}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
