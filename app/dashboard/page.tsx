"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import { FadeUp } from "@/components/FadeUp";
import { Footer } from "@/components/Footer";
import { MonoClock } from "@/components/MonoClock";
import { Navbar } from "@/components/Navbar";
import type { DailySleepPlan } from "@/lib/sleepAlgorithm";
import { formatTime12h } from "@/lib/sleepAlgorithm";
import type { PerformanceReport } from "@/lib/performanceAnalysis";
import type { PerformancePrediction } from "@/lib/performancePrediction";
import { formatPace } from "@/lib/unitUtils";
import type { UnitPreference } from "@/lib/unitUtils";
import { DayDetailModal } from "@/components/DayDetailModal";
import { PrPrompt } from "@/components/PrPrompt";
import { VerdictCard } from "@/components/VerdictCard";
import { TonightsTarget } from "@/components/TonightsTarget";
import { NextMeetCard } from "@/components/NextMeetCard";
import { SubscribeStrip } from "@/components/SubscribeStrip";
import { InstallNotice } from "@/components/InstallNotice";
import { RaceReadiness } from "@/components/RaceReadiness";
import { computeVerdict } from "@/lib/verdict";
import { STREAK_ANNOUNCE_FROM } from "@/lib/streak";
import type { TrendResult } from "@/lib/trend";

// Recharts is ~115 kB and the chart sits below the fold. Loading it with the
// page would delay the one thing the dashboard exists to show.
const SleepPaceTrendChart = dynamic(
  () => import("@/components/charts/SleepPaceTrendChart").then((m) => m.SleepPaceTrendChart),
  {
    ssr: false,
    loading: () => (
      <div className="h-[220px] border border-dashed border-[#E5E5E5] dark:border-[#333] flex items-center justify-center">
        <p className="font-mono text-[10px] uppercase tracking-widest text-[#6B6B6B]">
          Loading trend…
        </p>
      </div>
    ),
  },
);

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const LOAD_COLORS = {
  low: "bg-[#E5E5E5]",
  medium: "bg-[#6B6B6B]",
  high: "bg-[#0A0A0A]",
};

function parseTimeMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function minutesToTime(min: number): string {
  const total = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * Fetches JSON, resolving to null instead of throwing. A failing route returns
 * an empty body, and parsing that unconditionally throws "JSON.parse:
 * unexpected end of data" as an unhandled runtime error — which takes down the
 * whole dashboard for what may be one non-essential endpoint.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the payload is
// already consumed as `any` via the `data` state; typing it here buys nothing.
async function fetchJson(url: string, init?: RequestInit): Promise<any | null> {
  try {
    const res = await fetch(url, init);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function currentMinutes(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function normalizeMin(t: number): number {
  return t < 12 * 60 ? t + 1440 : t;
}

// ── Morning Confirmation Card ─────────────────────────────────────────────────

interface MorningCardProps {
  yesterdayPlan: DailySleepPlan;
  onDismiss: () => void;
}

function MorningConfirmationCard({ yesterdayPlan, onDismiss }: MorningCardProps) {
  const [phase, setPhase] = useState<"question" | "miss" | "submitting" | "done">("question");
  const [actualBedtime, setActualBedtime] = useState(() => {
    const rec = parseTimeMin(yesterdayPlan.recommendedBedtime);
    return minutesToTime(rec + 30);
  });
  const [actualWakeTime, setActualWakeTime] = useState(yesterdayPlan.recommendedWakeTime);
  const [visible, setVisible] = useState(true);

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const dateStr = yesterday.toISOString().slice(0, 10);

  const submit = async (hitTarget: boolean) => {
    setPhase("submitting");
    await fetch("/api/sleep-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: dateStr,
        hitTarget,
        actualBedtime: hitTarget ? undefined : actualBedtime,
        actualWakeTime: actualWakeTime || undefined,
        recommendedBedtime: yesterdayPlan.recommendedBedtime,
        // Freeze the night's target alongside the actual — the plan that
        // produced it is recomputed daily and will not survive to be charted.
        recommendedWakeTime: yesterdayPlan.recommendedWakeTime,
        targetSleepHours: yesterdayPlan.totalSleepHours,
      }),
    });
    setPhase("done");
    setTimeout(() => {
      setVisible(false);
      setTimeout(onDismiss, 200);
    }, 2000);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="bg-[#F5F5F5] dark:bg-[#0A0A0A] text-[#0A0A0A] dark:text-white border border-[#E5E5E5] dark:border-[#333] p-5"
        >
          <div>
            {phase === "done" ? (
              <div className="flex items-center gap-3">
                <span className="text-[#0A0A0A] dark:text-[#E8FF00] font-bold text-sm uppercase tracking-widest">✓ Logged</span>
                <span className="text-[#6B6B6B] font-mono text-xs">Sleep confirmed for last night.</span>
              </div>
            ) : (
              <>
                <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#6B6B6B] dark:text-[#E8FF00] mb-2">Last Night</p>
                <h2 className="font-black text-lg uppercase mb-3 leading-tight">Did You Hit Your Target?</h2>
                <p className="text-[11px] font-mono text-[#6B6B6B] mb-1">
                  Target bedtime: <span className="text-[#0A0A0A] dark:text-white font-bold">{formatTime12h(yesterdayPlan.recommendedBedtime)}</span>
                </p>
                <p className="text-[11px] font-mono text-[#6B6B6B] mb-4">
                  Target wake: <span className="text-[#0A0A0A] dark:text-white font-bold">{formatTime12h(yesterdayPlan.recommendedWakeTime)}</span>
                </p>

                {phase === "question" && (
                  <>
                    <div className="flex gap-px mb-3">
                      <button
                        onClick={() => submit(true)}
                        className="flex-1 min-h-[44px] px-2 bg-[#E8FF00] text-[#0A0A0A] font-black text-[11px] uppercase tracking-widest hover:bg-[#d4e800] transition-colors"
                      >
                        Yes, I Hit It
                      </button>
                      <button
                        onClick={() => setPhase("miss")}
                        className="flex-1 min-h-[44px] px-2 bg-white dark:bg-[#1a1a1a] text-[#0A0A0A] dark:text-white font-black text-[11px] uppercase tracking-widest hover:bg-[#E5E5E5] dark:hover:bg-[#2a2a2a] transition-colors border border-[#E5E5E5] dark:border-[#333]"
                      >
                        No, I Missed It
                      </button>
                    </div>
                    <p className="text-[10px] font-mono text-[#6B6B6B]">
                      You can edit this later in your{" "}
                      <a href="/sleep" className="underline hover:text-[#0A0A0A] dark:hover:text-white">sleep history</a>.
                    </p>
                  </>
                )}

                {phase === "miss" && (
                  <>
                    {/* Single column: this now sits in a narrow rail at every
                        width, so a two-up grid would crush both inputs. */}
                    <div className="grid grid-cols-1 gap-3 mb-3">
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-[#6B6B6B] mb-1">
                          I went to bed at:
                        </label>
                        <input
                          type="time"
                          value={actualBedtime}
                          onChange={(e) => setActualBedtime(e.target.value)}
                          className="w-full min-h-[44px] bg-white dark:bg-[#1a1a1a] border border-[#E5E5E5] dark:border-[#333] px-3 py-2 text-sm font-mono text-[#0A0A0A] dark:text-white focus:outline-none focus:border-[#0A0A0A] dark:focus:border-[#E8FF00]"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-[#6B6B6B] mb-1">
                          I woke up at: <span className="text-[#AAAAAA] dark:text-[#444]">(optional)</span>
                        </label>
                        <input
                          type="time"
                          value={actualWakeTime}
                          onChange={(e) => setActualWakeTime(e.target.value)}
                          className="w-full min-h-[44px] bg-white dark:bg-[#1a1a1a] border border-[#E5E5E5] dark:border-[#333] px-3 py-2 text-sm font-mono text-[#0A0A0A] dark:text-white focus:outline-none focus:border-[#0A0A0A] dark:focus:border-[#E8FF00]"
                        />
                      </div>
                    </div>
                    <button
                      onClick={() => submit(false)}
                      disabled={!actualBedtime}
                      className="w-full min-h-[44px] bg-[#0A0A0A] dark:bg-white text-white dark:text-[#0A0A0A] font-black text-xs uppercase tracking-widest hover:bg-[#333] dark:hover:bg-[#E5E5E5] transition-colors disabled:opacity-40"
                    >
                      Confirm
                    </button>
                    <p className="text-[10px] font-mono text-[#6B6B6B] mt-2">
                      You can edit this later in your{" "}
                      <a href="/sleep" className="underline hover:text-[#0A0A0A] dark:hover:text-white">sleep history</a>.
                    </p>
                  </>
                )}

                {phase === "submitting" && (
                  <p className="text-xs font-mono text-[#6B6B6B]">Saving…</p>
                )}
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── Intervention Card ─────────────────────────────────────────────────────────

interface InterventionCardProps {
  consecutiveMisses: number;
  avgDeviationMinutes: number;
  recommendedBedtime: string;
  unitPreference: "imperial" | "metric";
  onAdjust: (result: any) => void;
  onKeep: () => void;
  onRemindLater: () => void;
}

function InterventionCard({
  consecutiveMisses,
  avgDeviationMinutes,
  recommendedBedtime,
  unitPreference,
  onAdjust,
  onKeep,
  onRemindLater,
}: InterventionCardProps) {
  const [phase, setPhase] = useState<"question" | "adjusting" | "confirmed">("question");
  const [adjustResult, setAdjustResult] = useState<any>(null);
  const [visible, setVisible] = useState(true);

  const avgMin = parseTimeMin(recommendedBedtime);
  const avgActualMin = avgMin + avgDeviationMinutes;
  const avgActualTime = minutesToTime(avgActualMin);

  const impactPct = Math.min(8, Math.round((Math.abs(avgDeviationMinutes) / 30) * 2 * 10) / 10);
  const secondsLostPerMile = Math.round((impactPct / 100) * 458);
  const secondsLostDisplay = unitPreference === "metric"
    ? Math.round(secondsLostPerMile / 1.60934)
    : secondsLostPerMile;
  const paceUnitLabel = unitPreference === "metric" ? "per km" : "per mile";

  const handleAdjust = async () => {
    setPhase("adjusting");
    const r = await fetch("/api/sleep-log/adjust-targets", { method: "POST" });
    const result = await r.json();
    setAdjustResult(result);
    setPhase("confirmed");
    onAdjust(result);
  };

  const dismiss = (cb: () => void) => {
    setVisible(false);
    setTimeout(cb, 200);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="bg-[#F5F5F5] dark:bg-[#0A0A0A] text-[#0A0A0A] dark:text-white px-6 py-6 border-b border-[#E5E5E5] dark:border-[#222]"
        >
          <div className="max-w-[1200px] mx-auto">
            {phase === "confirmed" && adjustResult ? (
              <>
                <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] dark:text-[#E8FF00] mb-2">Target Adjusted</p>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <p className="text-[10px] text-[#6B6B6B] uppercase tracking-wider mb-1">Old target</p>
                    <p className="font-mono font-black text-2xl">{formatTime12h(adjustResult.oldTargetApprox)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-[#6B6B6B] dark:text-[#E8FF00] uppercase tracking-wider mb-1">New target</p>
                    <p className="font-mono font-black text-2xl text-[#0A0A0A] dark:text-[#E8FF00]">{formatTime12h(adjustResult.newTargetApprox)}</p>
                  </div>
                </div>
                <p className="text-xs font-mono text-[#6B6B6B] mb-1">
                  This adjustment reduces your estimated performance impact from {impactPct}% to{" "}
                  {Math.round(impactPct * 0.4 * 10) / 10}%.
                </p>
                {adjustResult.cappedAt45 && (
                  <p className="text-xs font-mono text-[#6B6B6B] dark:text-[#E8FF00] mt-2">
                    PRform can only adjust up to 45 minutes from the optimal target. Going beyond this would significantly impact your race performance.
                  </p>
                )}
                <p className="text-[10px] font-mono text-[#6B6B6B] mt-2">
                  You can change this anytime in <a href="/profile" className="underline hover:text-[#0A0A0A] dark:hover:text-white">Settings</a>.
                </p>
              </>
            ) : (
              <>
                <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] dark:text-[#E8FF00] mb-2">Sleep Pattern Detected</p>
                <h2 className="font-black text-2xl uppercase mb-3">
                  You&apos;ve Missed Your Target {consecutiveMisses} Night{consecutiveMisses !== 1 ? "s" : ""} in a Row
                </h2>
                <p className="text-xs font-mono text-[#6B6B6B] mb-3 leading-relaxed">
                  Your recommended bedtime has been{" "}
                  <span className="text-[#0A0A0A] dark:text-white font-bold">{formatTime12h(recommendedBedtime)}</span> but you&apos;ve been going to
                  bed around <span className="text-[#0A0A0A] dark:text-white font-bold">{formatTime12h(avgActualTime)}</span> instead, an average of{" "}
                  <span className="text-[#0A0A0A] dark:text-white font-bold">{avgDeviationMinutes} minutes late</span>.
                </p>
                <p className="text-xs font-mono text-[#0A0A0A] dark:text-[#E8FF00] mb-4 leading-relaxed">
                  Based on your running data, athletes with this sleep deficit pattern show an average pace decrease of{" "}
                  {impactPct}%. That&apos;s approximately {secondsLostDisplay}s {paceUnitLabel} on your current threshold pace.
                </p>
                <p className="font-black text-sm uppercase mb-4">
                  Would you like PRform to adjust your targets to better fit your schedule?
                </p>

                <div className="space-y-px">
                  <button
                    onClick={handleAdjust}
                    disabled={phase === "adjusting"}
                    className="w-full p-4 bg-[#E8FF00] text-[#0A0A0A] text-left hover:bg-[#d4e800] transition-colors disabled:opacity-50"
                  >
                    <p className="font-black text-xs uppercase tracking-widest">Yes, Adjust My Targets</p>
                    <p className="text-xs mt-1 text-[#0A0A0A]">
                      PRform will shift your recommended bedtime{" "}
                      {Math.abs(Math.min(45, Math.round(avgDeviationMinutes / 5) * 5))} minutes later to match your actual pattern, while minimising performance impact.
                    </p>
                  </button>
                  <button
                    onClick={() => dismiss(onKeep)}
                    className="w-full p-4 bg-white dark:bg-[#1a1a1a] text-[#0A0A0A] dark:text-white text-left border border-[#E5E5E5] dark:border-[#333] hover:bg-[#F5F5F5] dark:hover:bg-[#2a2a2a] transition-colors"
                  >
                    <p className="font-black text-xs uppercase tracking-widest">No, Keep My Current Targets</p>
                    <p className="text-xs text-[#6B6B6B] mt-1">I&apos;ll work on hitting {formatTime12h(recommendedBedtime)}.</p>
                  </button>
                  <button
                    onClick={() => dismiss(onRemindLater)}
                    className="w-full p-4 text-left text-[#6B6B6B] hover:text-[#0A0A0A] dark:hover:text-white transition-colors"
                  >
                    <p className="font-black text-xs uppercase tracking-widest">Remind Me Later</p>
                    <p className="text-xs mt-1">Ask me again after {consecutiveMisses + 2 - consecutiveMisses} more missed nights.</p>
                  </button>
                </div>
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── Wind-Down Single Phase ────────────────────────────────────────────────────

const WIND_DOWN_PHASES = [
  { label: "DIM LIGHTS", description: "Dim overhead lights. Move to lamps only." },
  { label: "NIGHT MODE", description: "Enable Night Shift / Night Mode on all devices." },
  { label: "NO SCREENS", description: "Put your phone across the room. No more screens." },
  { label: "LIGHTS OFF", description: "Lights off or near-dark. Lie down." },
];

interface WindDownSinglePhaseProps {
  windDown: { phase1: string; phase2: string; phase3: string; phase4: string };
  bedtime: string;
}

function WindDownSinglePhase({ windDown, bedtime }: WindDownSinglePhaseProps) {
  const [now, setNow] = useState(currentMinutes());

  useEffect(() => {
    const interval = setInterval(() => setNow(currentMinutes()), 60000);
    return () => clearInterval(interval);
  }, []);

  const phaseTimes = [windDown.phase1, windDown.phase2, windDown.phase3, windDown.phase4, bedtime];
  const normNow = normalizeMin(now);
  const normTimes = phaseTimes.map((t) => normalizeMin(parseTimeMin(t)));

  if (normNow >= normTimes[4]) {
    return (
      <div className="bg-[#F5F5F5] dark:bg-[#0A0A0A] p-6 border border-[#E5E5E5] dark:border-transparent">
        <p className="font-black text-lg uppercase text-[#0A0A0A] dark:text-[#E8FF00]">WIND-DOWN COMPLETE</p>
        <p className="text-sm font-mono text-[#6B6B6B] dark:text-[#AAAAAA] mt-2">Time to sleep. Target: {formatTime12h(bedtime)}</p>
      </div>
    );
  }

  let activeIdx = -1;
  for (let i = 3; i >= 0; i--) {
    if (normNow >= normTimes[i]) { activeIdx = i; break; }
  }

  const isUpcoming = activeIdx === -1;
  const phaseIdx = isUpcoming ? 0 : activeIdx;
  const phase = WIND_DOWN_PHASES[phaseIdx];
  const phaseTime = phaseTimes[phaseIdx];
  const minutesUntil = isUpcoming ? normTimes[0] - normNow : 0;

  const countdown = (() => {
    if (!isUpcoming) return "";
    if (minutesUntil >= 60) {
      const h = Math.floor(minutesUntil / 60);
      const m = minutesUntil % 60;
      return m > 0 ? `IN ${h}h ${m}m` : `IN ${h}h`;
    }
    return `IN ${minutesUntil}m`;
  })();

  return (
    <div className="bg-[#F5F5F5] dark:bg-[#0A0A0A] text-[#0A0A0A] dark:text-white p-6 flex items-start justify-between gap-4 sm:gap-6 border border-[#E5E5E5] dark:border-transparent">
      {/* min-w-0 is load-bearing: a flex child defaults to min-width:auto, so
          without it this column refuses to shrink below its own text and shoves
          the status block clean outside the card. */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3 mb-3">
          <span className={`text-xs font-bold uppercase tracking-widest ${isUpcoming ? "text-[#6B6B6B]" : "text-[#0A0A0A] dark:text-[#E8FF00]"}`}>
            {isUpcoming ? "UPCOMING" : "● NOW"}
          </span>
          <span className="font-mono text-sm text-[#6B6B6B]">{formatTime12h(phaseTime)}</span>
        </div>
        <p className="font-black text-xl uppercase mb-2">{phase.label}</p>
        <p className="text-sm text-[#6B6B6B] dark:text-[#AAAAAA] font-mono leading-relaxed">{phase.description}</p>
        {phaseIdx === 1 && (
          <div className="flex flex-wrap gap-2 mt-3">
            <a
              href="App-prefs:root=DISPLAY"
              className="text-xs font-bold uppercase tracking-wider px-3 py-1 border border-[#0A0A0A] dark:border-white hover:bg-[#0A0A0A] dark:hover:bg-white hover:text-white dark:hover:text-[#0A0A0A] transition-colors"
            >
              iOS Settings →
            </a>
            <a
              href="intent://settings"
              className="text-xs font-bold uppercase tracking-wider px-3 py-1 border border-[#0A0A0A] dark:border-white hover:bg-[#0A0A0A] dark:hover:bg-white hover:text-white dark:hover:text-[#0A0A0A] transition-colors"
            >
              Android Settings →
            </a>
          </div>
        )}
      </div>
      <div className="flex-shrink-0 text-right">
        {isUpcoming ? (
          <p className="font-mono font-black text-2xl text-[#0A0A0A] dark:text-white leading-none">{countdown}</p>
        ) : (
          <div className="flex flex-col items-end gap-1">
            <div className="w-3 h-3 bg-[#E8FF00] animate-pulse" />
            <p className="text-xs font-bold uppercase tracking-wider text-[#0A0A0A] dark:text-[#E8FF00]">ACTIVE NOW</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Performance Summary ───────────────────────────────────────────────────────

function PerformanceSummary({ report, unit }: { report: PerformanceReport; unit: UnitPreference }) {
  const { pmc, polarized, resolved, decoupling, sleepPerf } = report;
  return (
    <div className="space-y-px bg-[#E5E5E5] dark:bg-[#333]">
      <div className="bg-white dark:bg-[#242424] p-6">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] dark:text-[#A0A0A0] mb-4">Training Load</p>
        <div className="grid grid-cols-3 gap-6">
          {[["CTL", pmc.currentCTL, "Fitness"], ["ATL", pmc.currentATL, "Fatigue"], ["TSB", (pmc.currentTSB > 0 ? "+" : "") + pmc.currentTSB, "Form"]].map(([l, v, s]) => (
            <div key={l as string}>
              <p className="text-xs text-[#6B6B6B] dark:text-[#A0A0A0] uppercase tracking-wider mb-1">{l}</p>
              <p className="font-mono font-black text-3xl leading-none">{v}</p>
              <p className="text-xs text-[#6B6B6B] dark:text-[#A0A0A0] mt-1">{s}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-[#6B6B6B] dark:text-[#A0A0A0] mt-4 bg-[#F5F5F5] dark:bg-[#1a1a1a] px-3 py-2">{pmc.interpretation}</p>
      </div>

      <div className="bg-white dark:bg-[#242424] p-6">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] dark:text-[#A0A0A0] mb-4">Intensity Distribution</p>
        <div className="grid grid-cols-3 gap-4 mb-4">
          {[["Z1", polarized.zone1Pct], ["Z2", polarized.zone2Pct], ["Z3", polarized.zone3Pct]].map(([z, p]) => (
            <div key={z as string}>
              <p className="text-xs text-[#6B6B6B] dark:text-[#A0A0A0] uppercase tracking-wider">{z}</p>
              <p className="font-mono font-black text-2xl">{p}%</p>
            </div>
          ))}
        </div>
        <div className="w-full h-3 flex">
          <div className="h-full bg-white dark:bg-[#242424] border border-[#E5E5E5] dark:border-[#333]" style={{ width: `${polarized.zone1Pct}%` }} />
          <div className="h-full bg-[#6B6B6B]" style={{ width: `${polarized.zone2Pct}%` }} />
          <div className="h-full bg-[#E8FF00]" style={{ width: `${polarized.zone3Pct}%` }} />
        </div>
      </div>

      <div className="bg-white dark:bg-[#242424] p-6">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] dark:text-[#A0A0A0] mb-2">VDOT</p>
        {resolved.vdot && resolved.paces ? (
          <>
            <p className="font-mono font-black text-5xl leading-none mb-2">{resolved.vdot}</p>
            <p className="text-xs font-bold uppercase tracking-wider">{resolved.source.label}</p>
            <p className="text-xs text-[#6B6B6B] dark:text-[#A0A0A0] mt-1">{resolved.source.detail}</p>
            <p className="font-mono text-xs text-[#6B6B6B] dark:text-[#A0A0A0] mt-2">
              T-pace: <span className="text-[#0A0A0A] dark:text-[#F5F5F5] font-bold">{formatPace(resolved.paces.thresholdPaceMs, unit)}</span>
            </p>
          </>
        ) : (
          <p className="text-xs text-[#6B6B6B] dark:text-[#A0A0A0]">{resolved.source.detail}</p>
        )}
      </div>

      <div className="bg-white dark:bg-[#242424] p-6">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] dark:text-[#A0A0A0] mb-2">Aerobic Efficiency</p>
        <div className="flex items-end gap-3 mb-2">
          <p className="font-mono font-black text-4xl leading-none">{decoupling.rollingAvgDecoupling}%</p>
          <p className="text-xs font-bold uppercase tracking-wider mb-1 text-[#6B6B6B] dark:text-[#A0A0A0]">
            {decoupling.trend === "improving" ? "↓ Improving" : decoupling.trend === "declining" ? "↑ Declining" : "→ Stable"}
          </p>
        </div>
        <p className="text-xs text-[#6B6B6B] dark:text-[#A0A0A0]">Avg decoupling, lower is better</p>
      </div>

      <div className="bg-white dark:bg-[#242424] p-6">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] dark:text-[#A0A0A0] mb-2">Sleep × Pace</p>
        <p className="font-mono font-black text-2xl leading-none mb-2">r = {sleepPerf.correlation}</p>
        <p className="text-xs text-[#6B6B6B] dark:text-[#A0A0A0] leading-relaxed">{sleepPerf.insight}</p>
      </div>

      <div className="bg-white dark:bg-[#242424] p-6">
        <a href="/analysis" className="inline-block border border-[#0A0A0A] dark:border-[#F5F5F5] text-[#0A0A0A] dark:text-[#F5F5F5] font-black text-xs uppercase tracking-widest px-6 py-2 hover:bg-[#0A0A0A] dark:hover:bg-[#F5F5F5] hover:text-white dark:hover:text-[#0A0A0A] transition-colors">
          Full Analysis →
        </a>
      </div>
    </div>
  );
}

// ── Check-in streak ───────────────────────────────────────────────────────────
//
// One line, no flame, no confetti, no badge. The streak is a habit the athlete
// is keeping, not a prize we are giving them, and the visual weight should
// match — a counter that celebrates itself every morning becomes noise by the
// second week, and noise is what people mute.
//
// It counts days CHECKED IN. A late night that wrecked the target keeps the
// streak, which is exactly the point: the alternative teaches athletes to stop
// logging bad nights, and bad nights are the data this product exists to act
// on.

interface CheckInSummary {
  current: number;
  atRisk: boolean;
  canSkipTonight: boolean;
  longest: number;
  onHoldToday: boolean;
}

function CheckInStreakStrip({
  checkIn,
  onHoldSaved,
}: {
  checkIn?: CheckInSummary;
  onHoldSaved: () => void;
}) {
  const [planning, setPlanning] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Silent below three days. See STREAK_ANNOUNCE_FROM in lib/streak.ts.
  if (!checkIn || checkIn.current < STREAK_ANNOUNCE_FROM) return null;

  const beatingBest = checkIn.current >= checkIn.longest && checkIn.current > 3;

  const save = async () => {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/streak/hold", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startsOn: from, endsOn: to || from }),
    });
    if (res.ok) {
      setPlanning(false);
      setFrom("");
      setTo("");
      onHoldSaved();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "That didn't save. Try again.");
    }
    setSaving(false);
  };

  return (
    <section className="border-b border-[#E5E5E5] dark:border-[#333] px-6 py-4">
      <div className="max-w-[1200px] mx-auto">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <p className="font-mono text-sm">
            <span className="font-black tabular-nums">Day {checkIn.current}</span>
            <span className="text-[#6B6B6B] dark:text-[#A0A0A0]"> of checking in</span>
          </p>
          {beatingBest && (
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#6B6B6B] dark:text-[#A0A0A0]">
              Your longest yet
            </span>
          )}
          {checkIn.onHoldToday ? (
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#6B6B6B] dark:text-[#A0A0A0]">
              On hold
            </span>
          ) : checkIn.atRisk ? (
            // Not "you lost it". Last night is still open, and at 6:40am the
            // athlete can still keep it by logging on the way to practice.
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#6B6B6B] dark:text-[#A0A0A0]">
              Log last night to keep it
            </span>
          ) : (
            checkIn.canSkipTonight && (
              <span className="text-[10px] font-mono text-[#6B6B6B] dark:text-[#A0A0A0]">
                One skip in hand
              </span>
            )
          )}

          {!checkIn.onHoldToday && !planning && (
            <button
              type="button"
              onClick={() => setPlanning(true)}
              className="ml-auto text-[10px] font-bold uppercase tracking-wider text-[#6B6B6B] dark:text-[#A0A0A0] hover:text-[#0A0A0A] dark:hover:text-[#F5F5F5] transition-colors"
            >
              Going away?
            </button>
          )}
        </div>

        {planning && (
          <div className="mt-4 border border-[#E5E5E5] dark:border-[#333] p-4 max-w-lg">
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] dark:text-[#A0A0A0] mb-1">
              Mark days away
            </p>
            <p className="text-xs font-mono text-[#6B6B6B] dark:text-[#A0A0A0] mb-4">
              These days won&apos;t count for or against your streak.
            </p>
            <div className="flex flex-wrap gap-3 items-end">
              <label className="text-[10px] font-bold uppercase tracking-wider">
                <span className="block mb-1">From</span>
                <input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="border border-[#E5E5E5] dark:border-[#444] dark:bg-[#2a2a2a] dark:text-[#F5F5F5] px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#0A0A0A] dark:focus:border-[#F5F5F5]"
                />
              </label>
              <label className="text-[10px] font-bold uppercase tracking-wider">
                <span className="block mb-1">To</span>
                <input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="border border-[#E5E5E5] dark:border-[#444] dark:bg-[#2a2a2a] dark:text-[#F5F5F5] px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#0A0A0A] dark:focus:border-[#F5F5F5]"
                />
              </label>
              <button
                type="button"
                onClick={save}
                disabled={!from || saving}
                className="text-[10px] font-bold uppercase tracking-wider border border-[#0A0A0A] dark:border-[#F5F5F5] bg-[#0A0A0A] dark:bg-[#F5F5F5] text-white dark:text-[#0A0A0A] px-4 py-2 disabled:opacity-40 hover:bg-transparent hover:text-[#0A0A0A] dark:hover:bg-transparent dark:hover:text-[#F5F5F5] transition-colors"
              >
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                onClick={() => { setPlanning(false); setError(null); }}
                className="text-[10px] font-bold uppercase tracking-wider text-[#6B6B6B] dark:text-[#A0A0A0] hover:text-[#0A0A0A] dark:hover:text-[#F5F5F5] transition-colors"
              >
                Cancel
              </button>
            </div>
            {error && <p className="text-xs font-mono text-[#FF4444] mt-3">{error}</p>}
          </div>
        )}
      </div>
    </section>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { status } = useSession();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [activeTab, setActiveTab] = useState<"Sleep" | "Performance">("Sleep");
  const [stravaStatus, setStravaStatus] = useState<{ connected: boolean; recentActivities?: { name: string; startDate: string; distance: number; averageSpeed: number; averageHeartrate?: number | null }[] } | null>(null);
  const [perfReport, setPerfReport] = useState<PerformanceReport | null>(null);
  const [perfLoading, setPerfLoading] = useState(false);

  const [streakData, setStreakData] = useState<any>(null);
  const [morningCardDismissed, setMorningCardDismissed] = useState(false);
  const [interventionDismissed, setInterventionDismissed] = useState(false);

  /** Opened from the verdict's "Add a race PR" action, even after a dismissal. */
  const [prPromptOpen, setPrPromptOpen] = useState(false);

  const [trend, setTrend] = useState<(TrendResult & { windowDays: number; hasPaces: boolean }) | null>(null);

  const [dismissedDays, setDismissedDays] = useState<string[]>([]);
  const [selectedDay, setSelectedDay] = useState<DailySleepPlan | null>(null);
  const [selectedDayActivity, setSelectedDayActivity] = useState<any | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated") return;
    Promise.all([
      fetchJson("/api/sleep-plan", { cache: "no-store" }),
      fetchJson("/api/strava/status"),
      fetchJson("/api/sleep-log/streak"),
    ]).then(([sleepData, stravaData, streak]) => {
      if (sleepData?.redirect) {
        router.push(sleepData.redirect);
        return;
      }
      // Strava status and the streak are enrichment — the dashboard still
      // renders a verdict without them. Only the plan is load-bearing.
      if (!sleepData) {
        setLoadError(true);
        setLoading(false);
        return;
      }
      setData(sleepData);
      setStravaStatus(stravaData);
      setStreakData(streak);
      setLoading(false);
    });
  }, [status, router]);

  // Separate from the blocking load: the trend is below the fold and must never
  // hold up the verdict.
  useEffect(() => {
    if (status !== "authenticated") return;
    fetchJson("/api/trend?days=60").then((d) => {
      if (d) setTrend(d);
    });
  }, [status]);

  /** Re-pulls the user record so a newly saved PR is reflected immediately. */
  const refreshDashboard = useCallback(() => {
    fetchJson("/api/sleep-plan").then((d) => {
      if (d && !d.redirect) setData(d);
    });
  }, []);

  // A declared PR is enough to produce a report, so this no longer waits on Strava.
  const hasDeclaredPr = Boolean(data?.user?.prDistanceId);
  const showPrPrompt = !hasDeclaredPr && !data?.user?.prPromptDismissedAt;

  useEffect(() => {
    if (activeTab !== "Performance") return;
    if (!stravaStatus?.connected && !hasDeclaredPr) return;
    if (perfReport) return;
    setPerfLoading(true);
    fetch("/api/analysis?days=90")
      .then((r) => r.json())
      .then((d) => { if (!d.error) setPerfReport(d); })
      .finally(() => setPerfLoading(false));
  }, [activeTab, stravaStatus, perfReport, hasDeclaredPr]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("prform-dismissed-days");
      if (stored) setDismissedDays(JSON.parse(stored));
    } catch {}
  }, []);

  const dismissDay = useCallback((dateStr: string) => {
    const updated = [...dismissedDays, dateStr];
    setDismissedDays(updated);
    localStorage.setItem("prform-dismissed-days", JSON.stringify(updated));
  }, [dismissedDays]);

  const resetDismissed = useCallback(() => {
    setDismissedDays([]);
    localStorage.removeItem("prform-dismissed-days");
  }, []);

  const yesterdayPlan = data?.yesterdayPlan as DailySleepPlan | undefined;
  const showMorning = !morningCardDismissed && yesterdayPlan && !yesterdayPlan.sleepConfirmed;

  const interventionNextTrigger = (() => {
    if (typeof window === "undefined") return 3;
    return parseInt(localStorage.getItem("interventionNextTrigger") ?? "3", 10);
  })();
  const showIntervention = !interventionDismissed &&
    streakData && streakData.consecutiveMisses >= interventionNextTrigger &&
    !showMorning;

  const handleInterventionRemindLater = useCallback(() => {
    const next = (streakData?.consecutiveMisses ?? 3) + 2;
    localStorage.setItem("interventionNextTrigger", String(next));
    setInterventionDismissed(true);
  }, [streakData]);

  const handleInterventionKeep = useCallback(() => {
    const next = (streakData?.consecutiveMisses ?? 3) + 2;
    localStorage.setItem("interventionNextTrigger", String(next));
    setInterventionDismissed(true);
  }, [streakData]);

  /**
   * The headline instruction. Derived entirely from what /api/sleep-plan
   * already returns, so it paints with the first render rather than waiting on
   * a second request. Every degraded case still resolves to a verdict — see
   * lib/verdict.ts.
   */
  const verdict = useMemo(() => {
    const todayPlan = data?.plan?.[0] as DailySleepPlan | undefined;
    if (!todayPlan) return null;
    const tomorrowPlan = data?.plan?.[1] as DailySleepPlan | undefined;

    return computeVerdict({
      paces: data.resolved?.paces ?? null,
      paceSourceKind: data.resolved?.source?.kind ?? "none",
      unit: (data.user?.unitPreference ?? "imperial") as UnitPreference,
      stravaConnected: Boolean(data.fitness?.stravaConnected),
      totalSleepHours: todayPlan.totalSleepHours,
      // Only meaningful once a wake time has been declared; the plan reports a
      // zero shortfall on an ordinary night, which no branch acts on.
      sleepShortfallMinutes: todayPlan.sleepShortfallMinutes ?? null,
      achievableSleepHours: todayPlan.achievableSleepHours ?? null,
      recoveryScore: todayPlan.recoveryScore,
      trainingLoadLevel: todayPlan.trainingLoadLevel,
      tomorrowLoadLevel: tomorrowPlan?.trainingLoadLevel ?? null,
      daysUntilNextMeet: todayPlan.daysUntilNextMeet,
      nextMeetName: todayPlan.nextMeetName,
      nextMeetPriority: todayPlan.nextMeetPriority,
      tsb: data.fitness?.tsb ?? null,
      sleepDebtMinutes: data.fitness?.sleepDebtMinutes ?? null,
      nightsLogged: data.fitness?.nightsLogged ?? 0,
    });
  }, [data]);

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen bg-white dark:bg-[#1a1a1a] flex items-center justify-center">
        <p className="font-mono text-sm uppercase tracking-wider text-[#6B6B6B] dark:text-[#A0A0A0]">Loading…</p>
      </div>
    );
  }

  if (loadError || !data) {
    return (
      <div className="min-h-screen bg-white dark:bg-[#1a1a1a]">
        <Navbar />
        <section className="px-6 py-20">
          <div className="max-w-[1200px] mx-auto">
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] dark:text-[#A0A0A0] mb-4">
              Today
            </p>
            <h1 className="font-black uppercase leading-[1.05] max-w-[16ch] text-[clamp(24px,7vw,30px)] md:text-[clamp(30px,3.2vw,44px)]">
              Couldn&apos;t load your plan.
            </h1>
            <p className="mt-4 text-sm font-mono text-[#6B6B6B] dark:text-[#A0A0A0] max-w-[52ch]">
              The connection dropped or the server had a problem. Your data is fine.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="mt-6 inline-flex items-center min-h-[44px] px-5 text-[11px] font-bold uppercase tracking-widest border border-[#0A0A0A] dark:border-[#F5F5F5] text-[#0A0A0A] dark:text-[#F5F5F5] hover:bg-[#E8FF00] hover:border-[#E8FF00] hover:text-[#0A0A0A] transition-colors"
            >
              Try again →
            </button>
          </div>
        </section>
        <Footer />
      </div>
    );
  }

  const { plan, meets, meetPredictions = {} } = data;
  const today = plan[0] as DailySleepPlan;

  const week = Array.from({ length: 7 }, (_, i) => plan[i] ?? null);

  const nextMeet = meets?.find((m: any) => {
    const meetDate = new Date(m.date + 'T00:00:00');
    const todayMidnight = new Date();
    todayMidnight.setHours(0, 0, 0, 0);
    return meetDate >= todayMidnight;
  });

  const recoveryScore = today.recoveryScore;

  // Recovery factor text for Race Readiness card
  const recoveryFactorText = recoveryScore >= 80
    ? "Peak readiness. Ready to race."
    : today.recoveryFactors?.length > 0
    ? today.recoveryFactors[0]
    : recoveryScore >= 60
    ? "Moderate fatigue accumulating."
    : "High fatigue. Prioritize rest.";

  const nextMeetPred: PerformancePrediction | null = nextMeet ? (meetPredictions[nextMeet.id] ?? null) : null;

  const subscriptionStatus = data?.user?.subscriptionStatus as string | null | undefined;
  const isEarlyAccessUser = Boolean(data?.user?.earlyAccessUser);
  const trialEndsAt = data?.user?.trialEndsAt ? new Date(data.user.trialEndsAt) : null;
  const trialDaysLeft = trialEndsAt
    ? Math.max(0, Math.ceil((trialEndsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

  return (
    <div className="min-h-screen bg-white dark:bg-[#1a1a1a]">
      <Navbar />

      {/* Connect-Strava banner — shown until the user completes Strava OAuth.
          Training load drives the sleep plan, so this is the highest-priority
          nudge and sits above the subscription banner. */}
      {stravaStatus && !stravaStatus.connected && (
        <div className="bg-[#0A0A0A] px-6 py-3 flex items-center justify-between gap-4">
          <p className="font-black text-xs uppercase tracking-widest text-[#E8FF00]">
            Connect Strava to personalize tonight&apos;s plan
          </p>
          <a
            href="/api/strava/connect"
            className="bg-[#E8FF00] text-[#0A0A0A] font-black text-[10px] uppercase tracking-widest px-4 py-2 hover:bg-[#d4e800] transition-colors shrink-0"
          >
            Connect Strava →
          </a>
        </div>
      )}

      {/* Trial countdown — already a thin strip, and factual rather than a pitch */}
      {subscriptionStatus === "trialing" && trialDaysLeft !== null && (
        <div className="border-b border-[#E5E5E5] dark:border-[#333] px-6 py-2 flex items-center justify-between max-w-full">
          <p className="font-mono text-xs text-[#6B6B6B] dark:text-[#A0A0A0]">
            <span className="font-black text-[#0A0A0A] dark:text-[#F5F5F5]">{trialDaysLeft}d</span> left in your free trial
          </p>
          <a href="/subscribe" className="text-[10px] font-mono text-[#6B6B6B] dark:text-[#A0A0A0] hover:text-[#0A0A0A] dark:hover:text-[#F5F5F5] underline transition-colors">
            Manage billing →
          </a>
        </div>
      )}

      {/* Header region.
          Desktop — two columns: verdict left, the three at-a-glance cards in a
          narrower right rail, tabs full width beneath.
          Mobile — one column: verdict → target → last night → tabs → next meet,
          so the two things that earn a return visit clear the fold.

          The rail wrapper is `display: contents` on mobile, which dissolves it
          so its three cards become direct flex children and can be ordered
          individually around the tabs. At md it becomes a normal block in
          column two. One DOM node per card, two layouts, and only two grid rows
          — placing each card in its own row would leave a gap in the rail
          whenever the verdict grew taller than Tonight's Target. */}
      <div className="px-6">
        <div className="max-w-[1200px] mx-auto flex flex-col md:grid md:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] md:gap-x-10 md:items-start">
          {/* Left column. Same `contents` trick as the rail: on mobile it
              dissolves so the verdict stays first and Race Readiness drops
              below the tabs, while on desktop the two stack together and fill
              the space the verdict alone used to leave empty. */}
          <div className="contents md:block md:col-start-1 md:row-start-1 md:py-10 md:space-y-8">
            {verdict && (
              <div className="order-1 py-8 md:py-0">
                <VerdictCard verdict={verdict} onAddPr={() => setPrPromptOpen(true)} />
              </div>
            )}

            <div className="order-6 pb-8 md:pb-0">
              <RaceReadiness
                recoveryScore={recoveryScore}
                recoveryFactorText={recoveryFactorText}
                prediction={nextMeetPred}
              />
            </div>
          </div>

          <div className="contents md:block md:col-start-2 md:row-start-1 md:pt-10 md:space-y-4">
            <div className="order-2 pb-6 md:pb-0">
              <TonightsTarget today={today} />
            </div>

            {showMorning && !showIntervention && yesterdayPlan && (
              <div className="order-3 pb-6 md:pb-0">
                <MorningConfirmationCard
                  yesterdayPlan={yesterdayPlan}
                  onDismiss={() => setMorningCardDismissed(true)}
                />
              </div>
            )}

            <div className="order-5 pb-8 md:pb-0">
              <NextMeetCard
                meet={nextMeet ?? null}
                daysUntil={today.daysUntilNextMeet}
                hasPrediction={Boolean(nextMeet && meetPredictions[nextMeet.id])}
              />
            </div>
          </div>

          {/* Tab toggle */}
          <div className="order-4 border-b border-[#E5E5E5] dark:border-[#333] md:col-start-1 md:col-span-2 md:row-start-2 md:mt-8">
            <div className="flex">
              {(["Sleep", "Performance"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-6 min-h-[44px] py-3 text-xs font-black uppercase tracking-widest transition-colors border-b-2 ${
                    activeTab === tab
                      ? "border-[#0A0A0A] dark:border-[#F5F5F5] text-[#0A0A0A] dark:text-[#F5F5F5]"
                      : "border-transparent text-[#6B6B6B] dark:text-[#A0A0A0] hover:text-[#0A0A0A] dark:hover:text-[#F5F5F5]"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {!isEarlyAccessUser && subscriptionStatus !== "trialing" && subscriptionStatus !== "active" && (
        <SubscribeStrip />
      )}

      {/* Install notice for accounts that predate the app being installable.
          New accounts meet this as a step in onboarding instead. It shows
          itself only when it has something to ask for — not in the installed
          app, not once a device is subscribed, not after it has been
          dismissed, and not before the athlete has logged a night. */}
      <div className="px-6 pt-6 max-w-[1200px] mx-auto">
        <InstallNotice />
      </div>

      {prPromptOpen && (
        <div className="px-6 pt-6 max-w-[1200px] mx-auto">
          <PrPrompt
            onResolved={() => {
              setPrPromptOpen(false);
              setPerfReport(null);
              refreshDashboard();
            }}
          />
        </div>
      )}

      {/* Performance tab */}
      {activeTab === "Performance" && (
        <div className="max-w-[1200px] mx-auto px-6 py-10 space-y-6">
          {showPrPrompt && !prPromptOpen && (
            <FadeUp>
              <PrPrompt
                onResolved={() => {
                  setPerfReport(null);
                  refreshDashboard();
                }}
              />
            </FadeUp>
          )}
          {!stravaStatus?.connected && !hasDeclaredPr ? (
            <FadeUp>
              <div className="border border-[#E5E5E5] dark:border-[#333] p-10 text-center max-w-lg mx-auto">
                <h2 className="font-black text-2xl uppercase mb-3">Connect Strava</h2>
                <p className="text-sm text-[#6B6B6B] dark:text-[#A0A0A0] mb-6">Sync your runs to unlock performance analysis, or add a race PR above to get your paces now.</p>
                <a href="/api/strava/connect">
                  <img
                    src="/strava/btn_strava_connect.png"
                    alt="Connect with Strava"
                    style={{ height: "48px", width: "auto", cursor: "pointer" }}
                  />
                </a>
              </div>
            </FadeUp>
          ) : perfLoading ? (
            <p className="font-mono text-sm uppercase tracking-wider text-[#6B6B6B]">Computing performance…</p>
          ) : perfReport ? (
            <FadeUp>
              <PerformanceSummary
                report={perfReport}
                unit={(data.user?.unitPreference ?? "imperial") as UnitPreference}
              />
            </FadeUp>
          ) : (
            <FadeUp>
              <div className="border border-[#E5E5E5] dark:border-[#333] p-8 text-center">
                <p className="text-sm text-[#6B6B6B] dark:text-[#A0A0A0] mb-4">Sync your Strava activities to generate performance data.</p>
                <a href="/strava" className="inline-block border border-[#0A0A0A] dark:border-[#F5F5F5] dark:text-[#F5F5F5] font-black text-xs uppercase tracking-widest px-6 py-2 hover:bg-[#0A0A0A] dark:hover:bg-[#F5F5F5] hover:text-white dark:hover:text-[#0A0A0A] transition-colors">
                  Go to Strava →
                </a>
              </div>
            </FadeUp>
          )}
          {stravaStatus?.connected && (
            <p className="mt-6">
              <a href="https://www.strava.com" target="_blank" rel="noopener noreferrer" className="font-mono text-[10px] text-[#6B6B6B] no-underline hover:text-[#0A0A0A]">Powered by Strava</a>
            </p>
          )}
        </div>
      )}

      {activeTab === "Sleep" && (
        <>
          {/* 0. The check-in streak. Quiet by design and quiet by default —
                 it says nothing at all until day three, because announcing a
                 one-day streak tells someone they have nothing to protect. */}
          <CheckInStreakStrip
            checkIn={streakData?.checkIn}
            onHoldSaved={() =>
              fetchJson("/api/sleep-log/streak").then((s) => s && setStreakData(s))
            }
          />

          {/* 1. Intervention card */}
          {showIntervention && yesterdayPlan && (
            <InterventionCard
              consecutiveMisses={streakData.consecutiveMisses}
              avgDeviationMinutes={streakData.avgDeviationMinutes}
              recommendedBedtime={yesterdayPlan.recommendedBedtime}
              unitPreference={(data.user?.unitPreference ?? "imperial") as "imperial" | "metric"}
              onAdjust={() => setInterventionDismissed(true)}
              onKeep={handleInterventionKeep}
              onRemindLater={handleInterventionRemindLater}
            />
          )}

          {/* 2. The trend — the product's thesis, measured on this athlete.
                 Directly under the fold: it is the reason to come back, not the
                 reason to open the app. */}
          {trend && (
            <section className="border-b border-[#E5E5E5] dark:border-[#333] px-6 py-10">
              <div className="max-w-[1200px] mx-auto">
                <FadeUp>
                  <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] dark:text-[#A0A0A0] mb-2">
                    Sleep × Pace
                  </p>
                  <h2 className="font-black text-2xl uppercase mb-6">
                    Does Sleeping More Make You Faster?
                  </h2>
                </FadeUp>
                <FadeUp delay={80}>
                  <SleepPaceTrendChart
                    trend={trend}
                    windowDays={trend.windowDays}
                    hasPaces={trend.hasPaces}
                    onAddPr={() => setPrPromptOpen(true)}
                  />
                </FadeUp>
              </div>
            </section>
          )}

          {/* 3. Wind-Down — single active phase */}
          <section className="border-b border-[#E5E5E5] dark:border-[#333] px-6 py-10">
            <div className="max-w-[1200px] mx-auto">
              <FadeUp>
                <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] dark:text-[#A0A0A0] mb-2">Tonight&apos;s Wind-Down</p>
                <h2 className="font-black text-2xl uppercase mb-6">Wind-Down Protocol</h2>
              </FadeUp>
              <FadeUp delay={80}>
                <WindDownSinglePhase windDown={today.windDown} bedtime={today.recommendedBedtime} />
              </FadeUp>
              <FadeUp delay={100}>
                <p className="mt-4">
                  <a href="/sleep" className="text-xs font-mono text-[#6B6B6B] dark:text-[#A0A0A0] hover:text-[#0A0A0A] dark:hover:text-[#F5F5F5] transition-colors">
                    See full wind-down protocol →
                  </a>
                </p>
              </FadeUp>
            </div>
          </section>

          {/* 5. Weekly Sleep Schedule */}
          <section className="px-6 py-10 border-b border-[#E5E5E5] dark:border-[#333]">
            <div className="max-w-[1200px] mx-auto">
              <FadeUp>
                <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] dark:text-[#A0A0A0] mb-2">This Week</p>
                <div className="flex items-center gap-3 mb-6">
                  <h2 className="font-black text-2xl uppercase">Sleep Schedule</h2>
                  <span className="text-xs font-bold uppercase tracking-wider text-[#6B6B6B] dark:text-[#A0A0A0] border border-[#E5E5E5] dark:border-[#333] px-2 py-1">
                    Track &amp; Field
                  </span>
                </div>
              </FadeUp>
              {(() => {
                const activityByDate: Record<string, { name: string; distance: number; averageSpeed: number; averageHeartrate?: number | null }> = {};
                if (stravaStatus?.recentActivities) {
                  for (const act of stravaStatus.recentActivities) {
                    const d = new Date(act.startDate).toISOString().slice(0, 10);
                    if (!activityByDate[d]) activityByDate[d] = act;
                  }
                }
                const visibleWeek = week.filter((day) => {
                  if (!day) return true;
                  const dateStr = new Date((day as DailySleepPlan).date).toISOString().slice(0, 10);
                  return !dismissedDays.includes(dateStr);
                });
                return (
                  <>
                    <div className="overflow-x-auto">
                      <div className="flex gap-px min-w-[700px] bg-[#E5E5E5] dark:bg-[#333]">
                        {visibleWeek.map((day, i) => {
                          const d = day as DailySleepPlan | null;
                          const cardDate = d ? new Date(d.date) : null;
                          const isToday = cardDate ? cardDate.toDateString() === new Date().toDateString() : false;
                          const source = d?.workoutSource;
                          const tentative = d?.isTentative;
                          const dateStr = d ? new Date(d.date).toISOString().slice(0, 10) : null;

                          if (!d) return (
                            <div key={i} className={`flex-1 p-4 min-w-[100px] ${isToday ? "bg-[#F5F5F5] dark:bg-[#0A0A0A] border-2 border-[#0A0A0A] dark:border-transparent" : "bg-white dark:bg-[#242424]"}`}>
                              <p className={`text-xs font-bold uppercase tracking-wider mb-3 ${isToday ? "text-[#0A0A0A] dark:text-[#E8FF00]" : "text-[#6B6B6B] dark:text-[#A0A0A0]"}`}>{isToday ? "TODAY" : DAYS[i]}</p>
                              <p className="text-xs text-[#6B6B6B] dark:text-[#A0A0A0]">Rest</p>
                            </div>
                          );
                          return (
                            <FadeUp key={dateStr ?? i} delay={i * 50} className="flex-1 min-w-[100px]">
                              <div
                                className={`relative group p-4 h-full cursor-pointer border-2 transition-colors duration-150 ${
                                  isToday
                                    ? "bg-[#F5F5F5] dark:bg-[#0A0A0A] text-[#0A0A0A] dark:text-white border-[#0A0A0A] dark:border-transparent hover:border-[#E8FF00]"
                                    : "bg-white dark:bg-[#242424] border-transparent hover:border-[#0A0A0A] dark:hover:border-[#F5F5F5]"
                                }`}
                                onClick={() => {
                                  setSelectedDay(d);
                                  setSelectedDayActivity(dateStr ? (activityByDate[dateStr] ?? null) : null);
                                }}
                              >
                                <button
                                  className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity w-5 h-5 flex items-center justify-center text-xs text-[#6B6B6B] hover:text-[#0A0A0A] dark:hover:text-[#F5F5F5]"
                                  onClick={(e) => { e.stopPropagation(); if (dateStr) dismissDay(dateStr); }}
                                  title="Dismiss"
                                >
                                  ×
                                </button>
                                <p className={`text-xs font-bold uppercase tracking-wider mb-3 ${isToday ? "text-[#0A0A0A] dark:text-[#E8FF00]" : "text-[#6B6B6B] dark:text-[#A0A0A0]"}`}>
                                  {isToday ? "TODAY" : DAYS[(new Date(d.date).getDay() + 6) % 7]}
                                </p>
                                <MonoClock
                                  time24={d.recommendedBedtime}
                                  className={`text-base font-black block mb-1 ${isToday ? "text-[#0A0A0A] dark:text-[#E8FF00]" : ""}`}
                                  animate={isToday}
                                />
                                <p className={`text-xs font-mono mb-2 ${isToday ? "text-[#6B6B6B]" : "text-[#6B6B6B] dark:text-[#A0A0A0]"}`}>
                                  Wake <MonoClock time24={d.recommendedWakeTime} className="inline" />
                                </p>
                                {(() => {
                                  const isConfirmedPast = d.sleepConfirmed && d.actualSleepHours != null;
                                  const displayHours = isConfirmedPast ? d.actualSleepHours : d.totalSleepHours;
                                  const hoursLabel = isConfirmedPast ? "actual" : "target";
                                  return (
                                    <>
                                      <p className={`text-xs font-bold mb-1 ${isToday ? "text-[#0A0A0A] dark:text-[#A0A0A0]" : "text-[#6B6B6B] dark:text-[#A0A0A0]"}`}>
                                        {displayHours}h
                                      </p>
                                      <p className={`text-[10px] font-mono mb-2 ${isToday ? "text-[#6B6B6B]" : "text-[#AAAAAA] dark:text-[#555]"}`}>
                                        {hoursLabel}
                                      </p>
                                      {isToday && !yesterdayPlan?.sleepConfirmed && (
                                        <a
                                          href="/sleep"
                                          onClick={(e) => e.stopPropagation()}
                                          className="block text-[9px] font-bold uppercase tracking-widest text-[#0A0A0A] dark:text-[#E8FF00] hover:text-[#6B6B6B] dark:hover:text-white transition-colors mb-2"
                                        >
                                          Log Sleep →
                                        </a>
                                      )}
                                    </>
                                  );
                                })()}
                                <div className="flex items-center gap-1.5 mb-2">
                                  <div className={`w-2 h-2 ${LOAD_COLORS[d.trainingLoadLevel]}`} />
                                  <span className={`text-xs uppercase tracking-wider ${isToday ? "text-[#6B6B6B]" : "text-[#AAAAAA] dark:text-[#555]"}`}>
                                    {d.trainingLoadLevel}
                                  </span>
                                </div>
                                {source && source !== "rest" && (
                                  <div className="flex items-center gap-1 mt-1">
                                    <div className={`w-1.5 h-1.5 ${source === "strava" ? "bg-[#FC4C02]" : source === "manual" ? "bg-[#0A0A0A]" : "bg-[#E5E5E5]"}`} />
                                    <span className={`text-[10px] font-mono uppercase ${isToday ? "text-[#6B6B6B]" : "text-[#AAAAAA] dark:text-[#555]"}`}>
                                      {tentative ? (source === "assumed" ? "est. from load" : "tentative") : source}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </FadeUp>
                          );
                        })}
                      </div>
                    </div>
                    <div className="flex justify-between items-center mt-3">
                      {dismissedDays.length > 0 ? (
                        <p className="text-[10px] font-mono text-[#6B6B6B] dark:text-[#A0A0A0]">
                          {dismissedDays.length} card{dismissedDays.length > 1 ? "s" : ""} hidden ·{" "}
                          <button onClick={resetDismissed} className="underline hover:text-[#0A0A0A] dark:hover:text-[#F5F5F5]">RESET</button>
                        </p>
                      ) : <span />}
                      <a href="/schedule/history"
                        className="text-[10px] font-mono uppercase tracking-wider border border-[#E5E5E5] dark:border-[#333] px-3 py-1.5 text-[#6B6B6B] dark:text-[#A0A0A0] hover:border-[#0A0A0A] dark:hover:border-[#F5F5F5] transition-colors">
                        VIEW ALL →
                      </a>
                    </div>
                  </>
                );
              })()}
            </div>
          </section>

          <AnimatePresence>
            {selectedDay && (
              <DayDetailModal
                day={selectedDay}
                activity={selectedDayActivity ?? undefined}
                unit={(data.user?.unitPreference ?? "imperial") as "imperial" | "metric"}
                onClose={() => { setSelectedDay(null); setSelectedDayActivity(null); }}
              />
            )}
          </AnimatePresence>
        </>
      )}
      <Footer />
    </div>
  );
}
