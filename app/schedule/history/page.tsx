"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { FadeUp } from "@/components/FadeUp";
import { formatTime12h } from "@/lib/sleepAlgorithm";

type Filter = "month" | "3months" | "all";

const STATUS_BADGE: Record<string, string> = {
  HIT: "bg-[#0A0A0A] dark:bg-[#F5F5F5] text-white dark:text-[#0A0A0A]",
  MISSED: "border border-[#0A0A0A] dark:border-[#F5F5F5] text-[#0A0A0A] dark:text-[#F5F5F5]",
  UNLOGGED: "bg-[#F5F5F5] dark:bg-[#2a2a2a] text-[#6B6B6B] dark:text-[#A0A0A0]",
  NO_DATA: "bg-[#F5F5F5] dark:bg-[#1e1e1e] text-[#AAAAAA]",
};

function getDateRange(filter: Filter): { startDate?: string; endDate?: string } {
  const now = new Date();
  if (filter === "month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { startDate: start.toISOString().slice(0, 10) };
  }
  if (filter === "3months") {
    const start = new Date(now);
    start.setMonth(start.getMonth() - 3);
    return { startDate: start.toISOString().slice(0, 10) };
  }
  return {};
}

export default function HistoryPage() {
  const { status } = useSession();
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [rows, setRows] = useState<any[]>([]);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  const fetchRows = useCallback(async (cursor?: string, replace = false) => {
    const range = getDateRange(filter);
    const params = new URLSearchParams({ limit: "60" });
    if (range.startDate) params.set("startDate", range.startDate);
    if (cursor) params.set("cursor", cursor);

    const res = await fetch(`/api/history?${params}`);
    const data = await res.json();
    setRows((prev) => replace ? data.rows : [...prev, ...data.rows]);
    setNextCursor(data.nextCursor);
  }, [filter]);

  useEffect(() => {
    if (status !== "authenticated") return;
    setLoading(true);
    setRows([]);
    setNextCursor(undefined);
    fetchRows(undefined, true).finally(() => setLoading(false));
  }, [status, filter, fetchRows]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && nextCursor && !loadingMore) {
        setLoadingMore(true);
        fetchRows(nextCursor).finally(() => setLoadingMore(false));
      }
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [nextCursor, loadingMore, fetchRows]);

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-white dark:bg-[#1a1a1a] flex items-center justify-center">
        <p className="font-mono text-sm uppercase tracking-wider text-[#6B6B6B] dark:text-[#A0A0A0]">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-[#1a1a1a]">
      <Navbar />

      <section className="bg-[#0A0A0A] text-white px-6 py-10 border-b border-[#222]">
        <div className="max-w-[1200px] mx-auto">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] mb-2">Sleep Log</p>
          <h1 className="font-black text-4xl md:text-5xl uppercase leading-none mb-4">History</h1>
          <div className="flex gap-px">
            {([["month", "This Month"], ["3months", "Last 3 Months"], ["all", "All Time"]] as [Filter, string][]).map(([f, label]) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors ${
                  filter === f
                    ? "bg-[#E8FF00] text-[#0A0A0A]"
                    : "border border-[#333] text-[#6B6B6B] hover:border-[#999]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="max-w-[1200px] mx-auto px-6 py-10">
        {loading ? (
          <p className="font-mono text-sm uppercase tracking-wider text-[#6B6B6B] dark:text-[#A0A0A0]">Loading…</p>
        ) : rows.length === 0 ? (
          <FadeUp>
            <div className="border border-dashed border-[#E5E5E5] dark:border-[#444] p-12 text-center">
              <p className="text-sm text-[#6B6B6B] dark:text-[#A0A0A0]">No history for this period. Start logging your sleep from the dashboard.</p>
            </div>
          </FadeUp>
        ) : (
          <FadeUp>
            <div className="border border-[#E5E5E5] dark:border-[#333]">
              <div className="grid grid-cols-6 gap-px bg-[#E5E5E5] dark:bg-[#333] text-[10px] font-bold uppercase tracking-wider text-[#6B6B6B] dark:text-[#A0A0A0]">
                <div className="bg-white dark:bg-[#242424] px-4 py-2">Date</div>
                <div className="bg-white dark:bg-[#242424] px-4 py-2 col-span-2">Workout</div>
                <div className="bg-white dark:bg-[#242424] px-4 py-2">Sleep Target</div>
                <div className="bg-white dark:bg-[#242424] px-4 py-2">Actual</div>
                <div className="bg-white dark:bg-[#242424] px-4 py-2">Status</div>
              </div>

              {rows.map((row: any) => {
                const date = new Date(row.date + "T12:00:00Z");
                const dateLabel = date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
                const statusClass = STATUS_BADGE[row.status] ?? STATUS_BADGE.NO_DATA;

                return (
                  <div key={row.date} className="grid grid-cols-6 gap-px bg-[#E5E5E5] dark:bg-[#333] border-t border-[#E5E5E5] dark:border-[#333]">
                    <div className="bg-white dark:bg-[#242424] px-4 py-3 font-mono text-xs text-[#6B6B6B] dark:text-[#A0A0A0]">{dateLabel}</div>
                    <div className="bg-white dark:bg-[#242424] px-4 py-3 font-mono text-xs col-span-2 truncate">
                      {row.activity ? (
                        <span>
                          <span className="font-bold text-[#0A0A0A] dark:text-[#F5F5F5]">{row.activity.name}</span>
                          <span className="text-[#6B6B6B] dark:text-[#A0A0A0] ml-2">{(row.activity.distance / 1000).toFixed(1)} km · {row.activity.pace}</span>
                        </span>
                      ) : (
                        <span className="text-[#AAAAAA]">—</span>
                      )}
                    </div>
                    <div className="bg-white dark:bg-[#242424] px-4 py-3 font-mono text-xs">
                      {row.sleepLog?.recommendedBedtime ? formatTime12h(row.sleepLog.recommendedBedtime) : "—"}
                    </div>
                    <div className="bg-white dark:bg-[#242424] px-4 py-3 font-mono text-xs text-[#6B6B6B] dark:text-[#A0A0A0]">
                      {row.sleepLog?.hitTarget === true
                        ? formatTime12h(row.sleepLog.recommendedBedtime)
                        : row.sleepLog?.actualBedtime
                        ? formatTime12h(row.sleepLog.actualBedtime)
                        : "—"}
                    </div>
                    <div className="bg-white dark:bg-[#242424] px-4 py-3">
                      <span className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${statusClass}`}>
                        {row.status}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {loadingMore && (
              <p className="font-mono text-xs text-[#6B6B6B] dark:text-[#A0A0A0] text-center mt-4">Loading more…</p>
            )}
            <div ref={sentinelRef} className="h-4" />
          </FadeUp>
        )}
      </div>

      <Footer />
    </div>
  );
}
