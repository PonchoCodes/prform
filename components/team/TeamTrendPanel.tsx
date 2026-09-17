"use client";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { TeamTrend } from "@/lib/teamTrend";

// The team trend, and this week's row per athlete. Recharts is loaded the
// way the dashboard loads it: dynamically, client only, with a placeholder
// the same height so the page does not jump.

const TeamTrendChart = dynamic(
  () => import("@/components/charts/TeamTrendChart").then((m) => m.TeamTrendChart),
  {
    ssr: false,
    loading: () => (
      <div className="h-[220px] border border-dashed border-[#E5E5E5] dark:border-[#333] flex items-center justify-center">
        <p className="font-mono text-[10px] uppercase tracking-widest text-[#6B6B6B]">Loading trend…</p>
      </div>
    ),
  },
);

export function TeamTrendPanel({ teamId, needsPlan }: { teamId: string; needsPlan: boolean }) {
  const [trend, setTrend] = useState<TeamTrend | null>(null);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/teams/${teamId}/trend`)
      .then(async (r) => {
        if (cancelled) return;
        if (r.ok) setTrend(await r.json());
        else if (r.status === 402) setLocked(true);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [teamId]);

  const isLocked = needsPlan || locked;

  return (
    <div className="p-6 border-t border-[#E5E5E5] dark:border-[#333]">
      <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] mb-4">Trend</p>

      {isLocked ? (
        <p className="text-sm text-[#6B6B6B] dark:text-[#A0A0A0]">
          The week-by-week trend comes with the team plan.{" "}
          <a
            href={`/team/billing?team=${teamId}`}
            className="font-bold text-[#0A0A0A] dark:text-[#F5F5F5] border-b border-[#E8FF00]"
          >
            See what it costs
          </a>
          .
        </p>
      ) : !trend ? (
        <p className="text-xs font-mono text-[#6B6B6B] dark:text-[#A0A0A0]">Loading…</p>
      ) : (
        <>
          <TeamTrendChart trend={trend} />

          {trend.ready && trend.athletes.length > 0 && (
            <div className="mt-6">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#6B6B6B] dark:text-[#A0A0A0] mb-1">
                This week
              </p>
              <div className="space-y-px bg-[#E5E5E5] dark:bg-[#333]">
                <div className="bg-white dark:bg-[#242424] px-3 py-1.5 flex items-center gap-3 text-[10px] font-mono uppercase tracking-wider text-[#6B6B6B] dark:text-[#A0A0A0]">
                  <span className="flex-1">Athlete</span>
                  <span className="w-20 text-right">Targets</span>
                  <span className="w-20 text-right">Logged</span>
                  <span className="w-16 text-right">Short</span>
                </div>
                {trend.athletes.map((a) => (
                  <div
                    key={a.name}
                    className="bg-white dark:bg-[#242424] px-3 py-2 flex items-center gap-3 font-mono text-xs tabular-nums"
                  >
                    <span className="flex-1 font-bold uppercase tracking-wider truncate">{a.name}</span>
                    <span className="w-20 text-right">{a.compliance === null ? "–" : `${a.compliance}%`}</span>
                    <span className="w-20 text-right">
                      {a.nightsLogged}/{a.nightsPossible}
                      <span className="text-[#6B6B6B] dark:text-[#A0A0A0]">
                        {a.loggingRate === null ? "" : ` ${a.loggingRate}%`}
                      </span>
                    </span>
                    <span className={`w-16 text-right ${a.shortNights > 0 ? "text-[#FF4444]" : ""}`}>
                      {a.shortNights}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
