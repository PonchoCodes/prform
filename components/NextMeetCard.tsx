"use client";

import { useRouter } from "next/navigation";
import { Badge } from "@/components/Badge";
import { formatTime12h } from "@/lib/sleepAlgorithm";

interface Meet {
  id: string;
  name: string;
  date: string;
  priority: string;
  raceTime?: string | null;
  primaryEvent?: string | null;
  personalBest?: string | null;
  recentBest?: string | null;
}

interface Props {
  meet: Meet | null;
  daysUntil: number | null;
  /** True when a prediction already exists, so we don't prompt for its inputs. */
  hasPrediction: boolean;
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/**
 * The countdown and its priority. The predicted finish lives in Race Readiness,
 * which has room for the reference time and the confidence line — this card
 * only prompts for whatever is still missing to compute one.
 */
export function NextMeetCard({ meet, daysUntil, hasPrediction }: Props) {
  const router = useRouter();

  if (!meet) {
    return (
      <div className="border border-[#E5E5E5] dark:border-[#333] p-5">
        <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#6B6B6B] dark:text-[#A0A0A0] mb-3">
          Next Meet
        </p>
        <button
          onClick={() => router.push("/meets")}
          className="text-left text-sm font-mono text-[#6B6B6B] dark:text-[#A0A0A0] min-h-[44px]"
        >
          <span className="border-b border-[#0A0A0A] dark:border-[#F5F5F5] text-[#0A0A0A] dark:text-[#F5F5F5]">
            Add your next meet
          </span>{" "}
          and the plan starts shifting your sleep toward it. →
        </button>
      </div>
    );
  }

  const missingPr = Boolean(meet.primaryEvent) && !(meet.recentBest || meet.personalBest);
  const missingEvent = !meet.primaryEvent;
  const showPrompt = !hasPrediction && (missingPr || missingEvent);

  return (
    <div
      className="border border-[#E5E5E5] dark:border-[#333] p-5 cursor-pointer hover:border-[#0A0A0A] dark:hover:border-[#F5F5F5] transition-colors"
      onClick={() => router.push("/meets")}
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#6B6B6B] dark:text-[#A0A0A0] mb-3">
        Next Meet
      </p>

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-black text-lg leading-tight truncate">{meet.name}</p>
          <p className="text-[#6B6B6B] dark:text-[#A0A0A0] text-xs mt-1 mb-2 font-mono">
            {formatDate(meet.date)}
          </p>
          <Badge label={`${meet.priority} Race`} variant={meet.priority as "A" | "B" | "C"} />
        </div>
        <div className="text-right shrink-0">
          <p className="font-mono font-black text-4xl text-[#0A0A0A] dark:text-[#E8FF00] leading-none">
            {daysUntil ?? 0}
          </p>
          <p className="text-[#6B6B6B] text-[10px] uppercase tracking-wider mt-1">days away</p>
        </div>
      </div>

      {meet.raceTime && daysUntil !== null && daysUntil <= 10 && (
        <p className="text-[#6B6B6B] text-[10px] font-mono uppercase tracking-wider mt-3">
          Race at {formatTime12h(meet.raceTime)}
        </p>
      )}

      {daysUntil !== null && daysUntil <= 10 && (
        <p className="mt-2 text-[10px] text-[#0A0A0A] dark:text-[#E8FF00] font-bold uppercase tracking-wider">
          Sleep shift in progress ↗
        </p>
      )}

      {showPrompt && (
        <div className="mt-4 pt-4 border-t border-[#E5E5E5] dark:border-[#222]">
          <button
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/meets?edit=${meet.id}`);
            }}
            className="inline-flex items-center min-h-[44px] px-3 text-[11px] font-bold uppercase tracking-wider text-[#6B6B6B] hover:text-[#0A0A0A] dark:hover:text-white border border-[#E5E5E5] dark:border-[#333] hover:border-[#0A0A0A] dark:hover:border-[#555] transition-colors"
          >
            {missingEvent ? "Add event + PR" : "Add PR"} →
          </button>
        </div>
      )}
    </div>
  );
}
