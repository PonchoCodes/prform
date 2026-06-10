"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

interface WaitlistEntry {
  id: string;
  email: string;
  name: string;
  role: "RUNNER" | "COACH";
  weeklyMileage: number | null;
  usesStrava: boolean;
  notes: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: string;
  approvedAt: string | null;
}

export function AdminWaitlist() {
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [approvedCount, setApprovedCount] = useState(0);
  const [cap, setCap] = useState(10);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/waitlist");
    if (!res.ok) {
      setError("Failed to load waitlist");
      setLoading(false);
      return;
    }
    const data = await res.json();
    setEntries(data.entries);
    setApprovedCount(data.approvedCount);
    setCap(data.cap);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (id: string, action: "approve" | "reject") => {
    setActingId(id);
    setError(null);
    const res = await fetch("/api/admin/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Action failed");
    }
    await load();
    setActingId(null);
  };

  const pending = entries.filter((e) => e.status === "PENDING");
  const decided = entries.filter((e) => e.status !== "PENDING");
  const capReached = approvedCount >= cap;

  return (
    <div className="min-h-screen bg-white dark:bg-[#1a1a1a]">
      <nav className="border-b border-[#E5E5E5] dark:border-[#333] px-6 h-14 flex items-center justify-between">
        <Link href="/dashboard" className="font-black text-xl uppercase tracking-tight">
          PR<span className="text-[#E8FF00] bg-[#0A0A0A] px-1">form</span>
        </Link>
        <span className="text-xs font-bold uppercase tracking-wider text-[#6B6B6B] dark:text-[#A0A0A0]">
          Admin
        </span>
      </nav>

      <div className="max-w-[900px] mx-auto px-6 py-12">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] dark:text-[#A0A0A0] mb-3">
          Early Access
        </p>
        <div className="flex items-end justify-between mb-10">
          <h1 className="font-black text-4xl uppercase dark:text-[#F5F5F5]">Waitlist</h1>
          <p className={`font-mono font-black text-2xl ${capReached ? "text-[#FF4444]" : "dark:text-[#F5F5F5]"}`}>
            {approvedCount}<span className="text-[#6B6B6B] text-base">/{cap} approved</span>
          </p>
        </div>

        {capReached && (
          <div className="bg-[#0A0A0A] px-4 py-3 mb-6">
            <p className="text-xs font-bold uppercase tracking-wider text-[#E8FF00]">
              Approval cap reached — Strava Standard tier allows {cap} connected athletes
            </p>
          </div>
        )}

        {error && (
          <p className="text-xs font-bold text-[#FF4444] uppercase tracking-wider mb-6">{error}</p>
        )}

        {loading ? (
          <p className="font-mono text-sm text-[#6B6B6B]">Loading…</p>
        ) : (
          <>
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] dark:text-[#A0A0A0] mb-4">
              Pending ({pending.length})
            </p>
            {pending.length === 0 && (
              <p className="font-mono text-sm text-[#6B6B6B] mb-10">No pending requests.</p>
            )}
            <div className="divide-y divide-[#E5E5E5] dark:divide-[#333] border border-[#E5E5E5] dark:border-[#333] mb-12 empty:hidden">
              {pending.map((e) => (
                <div key={e.id} className="p-4 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-black text-sm uppercase dark:text-[#F5F5F5]">{e.name}</p>
                    <p className="font-mono text-xs text-[#6B6B6B] break-all">{e.email}</p>
                    <p className="font-mono text-xs text-[#6B6B6B] mt-1">
                      {e.role}
                      {e.weeklyMileage != null && ` · ${e.weeklyMileage} mi/wk`}
                      {` · Strava: ${e.usesStrava ? "yes" : "no"}`}
                      {` · ${new Date(e.createdAt).toLocaleDateString()}`}
                    </p>
                    {e.notes && (
                      <p className="text-xs text-[#6B6B6B] dark:text-[#A0A0A0] mt-2 leading-relaxed">{e.notes}</p>
                    )}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => act(e.id, "approve")}
                      disabled={actingId !== null || capReached}
                      className="bg-[#0A0A0A] text-white px-4 py-2 text-xs font-bold uppercase tracking-wider hover:bg-[#E8FF00] hover:text-[#0A0A0A] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {actingId === e.id ? "…" : "Approve"}
                    </button>
                    <button
                      onClick={() => act(e.id, "reject")}
                      disabled={actingId !== null}
                      className="border border-[#E5E5E5] dark:border-[#444] px-4 py-2 text-xs font-bold uppercase tracking-wider hover:border-[#FF4444] hover:text-[#FF4444] transition-colors dark:text-[#A0A0A0] disabled:opacity-40"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {decided.length > 0 && (
              <>
                <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] dark:text-[#A0A0A0] mb-4">
                  Decided ({decided.length})
                </p>
                <div className="divide-y divide-[#E5E5E5] dark:divide-[#333] border border-[#E5E5E5] dark:border-[#333]">
                  {decided.map((e) => (
                    <div key={e.id} className="p-4 flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="font-black text-sm uppercase dark:text-[#F5F5F5]">{e.name}</p>
                        <p className="font-mono text-xs text-[#6B6B6B] break-all">{e.email}</p>
                      </div>
                      <span
                        className={`text-xs font-bold uppercase tracking-wider px-2 py-1 shrink-0 ${
                          e.status === "APPROVED"
                            ? "bg-[#0A0A0A] text-[#E8FF00]"
                            : "border border-[#E5E5E5] dark:border-[#444] text-[#6B6B6B]"
                        }`}
                      >
                        {e.status}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
