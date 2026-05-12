"use client";
import type { RunAnalysis } from "@/lib/performanceAnalysis";

interface Props {
  runs: RunAnalysis[];
}

const BADGE: Record<string, { label: string; className: string }> = {
  ON_TARGET: { label: "ON TARGET", className: "bg-[#0A0A0A] text-white" },
  TOO_FAST: { label: "TOO FAST", className: "bg-[#E8FF00] text-[#0A0A0A]" },
  TOO_SLOW: { label: "TOO SLOW", className: "bg-[#E5E5E5] text-[#6B6B6B]" },
};

export function PaceComplianceTable({ runs }: Props) {
  if (runs.length === 0) {
    return <p className="text-xs font-mono text-[#6B6B6B]">No recent runs to display.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs font-mono">
        <thead>
          <tr className="border-b border-[#E5E5E5] dark:border-[#333]">
            <th className="text-left py-2 pr-4 font-bold uppercase tracking-wider text-[#6B6B6B] dark:text-[#A0A0A0]">Date</th>
            <th className="text-left py-2 pr-4 font-bold uppercase tracking-wider text-[#6B6B6B] dark:text-[#A0A0A0]">Run</th>
            <th className="text-left py-2 pr-4 font-bold uppercase tracking-wider text-[#6B6B6B] dark:text-[#A0A0A0]">Type</th>
            <th className="text-left py-2 pr-4 font-bold uppercase tracking-wider text-[#6B6B6B] dark:text-[#A0A0A0]">Pace</th>
            <th className="text-left py-2 font-bold uppercase tracking-wider text-[#6B6B6B] dark:text-[#A0A0A0]">Status</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => {
            const badge = BADGE[run.compliance];
            return (
              <tr key={run.stravaId} className="border-b border-[#E5E5E5] dark:border-[#333] hover:bg-[#F5F5F5] dark:hover:bg-[#2a2a2a] transition-colors">
                <td className="py-2 pr-4 text-[#6B6B6B] dark:text-[#A0A0A0]">{run.date}</td>
                <td className="py-2 pr-4 max-w-[160px] truncate">{run.name}</td>
                <td className="py-2 pr-4 text-[#6B6B6B] dark:text-[#A0A0A0] capitalize">{run.intendedType}</td>
                <td className="py-2 pr-4 font-bold">{run.averagePaceMinKm}</td>
                <td className="py-2">
                  <span className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${badge.className}`}>
                    {badge.label}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
