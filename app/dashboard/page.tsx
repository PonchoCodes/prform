"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import { FadeUp } from "@/components/FadeUp";
import { Footer } from "@/components/Footer";
import { MonoClock } from "@/components/MonoClock";
import { Badge } from "@/components/Badge";
import { Navbar } from "@/components/Navbar";
import type { DailySleepPlan } from "@/lib/sleepAlgorithm";
import { formatTime12h } from "@/lib/sleepAlgorithm";
import type { PerformanceReport } from "@/lib/performanceAnalysis";
import { formatTimeFromSeconds, formatTimeDifference } from "@/lib/performancePrediction";
import type { PerformancePrediction } from "@/lib/performancePrediction";
import { DayDetailModal } from "@/components/DayDetailModal";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const LOAD_COLORS = {
  low: "bg-[#E5E5E5]",
  medium: "bg-[#6B6B6B]",
  high: "bg-[#0A0A0A]",
};

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function parseTimeMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function minutesToTime(min: number): string {
  const total = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
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
          className="bg-[#0A0A0A] text-white px-6 py-6 border-b border-[#222]"
        >
          <div className="max-w-[1200px] mx-auto">
            {phase === "done" ? (
              <div className="flex items-center gap-3">
                <span className="text-[#E8FF00] font-bold text-sm uppercase tracking-widest">✓ Logged</span>
                <span className="text-[#6B6B6B] font-mono text-xs">Sleep confirmed for last night.</span>
              </div>
            ) : (
              <>
                <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#E8FF00] mb-2">Last Night</p>
                <h2 className="font-black text-2xl uppercase mb-3">Did You Hit Your Target?</h2>
                <p className="text-xs font-mono text-[#6B6B6B] mb-1">
                  Target bedtime: <span className="text-white">{formatTime12h(yesterdayPlan.recommendedBedtime)}</span>
                </p>
                <p className="text-xs font-mono text-[#6B6B6B] mb-4">
                  Target wake: <span className="text-white">{formatTime12h(yesterdayPlan.recommendedWakeTime)}</span>
                </p>

                {phase === "question" && (
                  <>
                    <div className="flex gap-px mb-3">
                      <button
                        onClick={() => submit(true)}
                        className="flex-1 py-3 bg-[#E8FF00] text-[#0A0A0A] font-black text-xs uppercase tracking-widest hover:bg-[#d4e800] transition-colors"
                      >
                        Yes, I Hit It
                      </button>
                      <button
                        onClick={() => setPhase("miss")}
                        className="flex-1 py-3 bg-white text-[#0A0A0A] font-black text-xs uppercase tracking-widest hover:bg-[#E5E5E5] transition-colors border border-[#E5E5E5]"
                      >
                        No, I Missed It
                      </button>
                    </div>
                    <p className="text-[10px] font-mono text-[#6B6B6B]">
                      You can edit this later in your{" "}
                      <a href="/sleep" className="underline hover:text-white">sleep history</a>.
                    </p>
                  </>
                )}

                {phase === "miss" && (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-[#6B6B6B] mb-1">
                          I went to bed at:
                        </label>
                        <input
                          type="time"
                          value={actualBedtime}
                          onChange={(e) => setActualBedtime(e.target.value)}
                          className="w-full bg-[#1a1a1a] border border-[#333] px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-[#E8FF00]"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-[#6B6B6B] mb-1">
                          I woke up at: <span className="text-[#444]">(optional)</span>
                        </label>
                        <input
                          type="time"
                          value={actualWakeTime}
                          onChange={(e) => setActualWakeTime(e.target.value)}
                          className="w-full bg-[#1a1a1a] border border-[#333] px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-[#E8FF00]"
                        />
                      </div>
                    </div>
                    <button
                      onClick={() => submit(false)}
                      disabled={!actualBedtime}
                      className="w-full py-3 bg-white text-[#0A0A0A] font-black text-xs uppercase tracking-widest hover:bg-[#E5E5E5] transition-colors disabled:opacity-40"
                    >
                      Confirm
                    </button>
                    <p className="text-[10px] font-mono text-[#6B6B6B] mt-2">
                      You can edit this later in your{" "}
                      <a href="/sleep" className="underline hover:text-white">sleep history</a>.
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
          className="bg-[#0A0A0A] text-white px-6 py-6 border-b border-[#222]"
        >
          <div className="max-w-[1200px] mx-auto">
            {phase === "confirmed" && adjustResult ? (
              <>
                <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#E8FF00] mb-2">Target Adjusted</p>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <p className="text-[10px] text-[#6B6B6B] uppercase tracking-wider mb-1">Old target</p>
                    <p className="font-mono font-black text-2xl">{formatTime12h(adjustResult.oldTargetApprox)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-[#E8FF00] uppercase tracking-wider mb-1">New target</p>
                    <p className="font-mono font-black text-2xl text-[#E8FF00]">{formatTime12h(adjustResult.newTargetApprox)}</p>
                  </div>
                </div>
                <p className="text-xs font-mono text-[#6B6B6B] mb-1">
                  This adjustment reduces your estimated performance impact from {impactPct}% to{" "}
                  {Math.round(impactPct * 0.4 * 10) / 10}%.
                </p>
                {adjustResult.cappedAt45 && (
                  <p className="text-xs font-mono text-[#E8FF00] mt-2">
                    PRform can only adjust up to 45 minutes from the optimal target. Going beyond this would significantly impact your race performance.
                  </p>
                )}
                <p className="text-[10px] font-mono text-[#6B6B6B] mt-2">
                  You can change this anytime in <a href="/profile" className="underline hover:text-white">Settings</a>.
                </p>
              </>
            ) : (
              <>
                <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#E8FF00] mb-2">Sleep Pattern Detected</p>
                <h2 className="font-black text-2xl uppercase mb-3">
                  You&apos;ve Missed Your Target {consecutiveMisses} Night{consecutiveMisses !== 1 ? "s" : ""} in a Row
                </h2>
                <p className="text-xs font-mono text-[#6B6B6B] mb-3 leading-relaxed">
                  Your recommended bedtime has been{" "}
                  <span className="text-white">{formatTime12h(recommendedBedtime)}</span> but you&apos;ve been going to
                  bed around <span className="text-white">{formatTime12h(avgActualTime)}</span> instead — an average of{" "}
                  <span className="text-white">{avgDeviationMinutes} minutes late</span>.
                </p>
                <p className="text-xs font-mono text-[#E8FF00] mb-4 leading-relaxed">
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
                    <p className="font-black text-xs uppercase tracking-widest">Yes — Adjust My Targets</p>
                    <p className="text-xs mt-1 text-[#1a1a00]">
                      PRform will shift your recommended bedtime{" "}
                      {Math.abs(Math.min(45, Math.round(avgDeviationMinutes / 5) * 5))} minutes later to match your actual pattern, while minimising performance impact.
                    </p>
                  </button>
                  <button
                    onClick={() => dismiss(onKeep)}
                    className="w-full p-4 bg-white text-[#0A0A0A] text-left border border-[#E5E5E5] hover:bg-[#F5F5F5] transition-colors"
                  >
                    <p className="font-black text-xs uppercase tracking-widest">No — Keep My Current Targets</p>
                    <p className="text-xs text-[#6B6B6B] mt-1">I&apos;ll work on hitting {formatTime12h(recommendedBedtime)}.</p>
                  </button>
                  <button
                    onClick={() => dismiss(onRemindLater)}
                    className="w-full p-4 text-left text-[#6B6B6B] hover:text-white transition-colors"
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
      <div className="bg-[#0A0A0A] text-white p-6">
        <p className="font-black text-lg uppercase text-[#E8FF00]">WIND-DOWN COMPLETE</p>
        <p className="text-sm font-mono text-[#AAAAAA] mt-2">Time to sleep. Target: {formatTime12h(bedtime)}</p>
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
    <div className="bg-[#0A0A0A] text-white p-6 flex items-start justify-between gap-6">
      <div className="flex-1">
        <div className="flex items-center gap-3 mb-3">
          <span className={`text-xs font-bold uppercase tracking-widest ${isUpcoming ? "text-[#6B6B6B]" : "text-[#E8FF00]"}`}>
            {isUpcoming ? "UPCOMING" : "● NOW"}
          </span>
          <span className="font-mono text-sm text-[#6B6B6B]">{formatTime12h(phaseTime)}</span>
        </div>
        <p className="font-black text-xl uppercase mb-2">{phase.label}</p>
        <p className="text-sm text-[#AAAAAA] font-mono leading-relaxed">{phase.description}</p>
        {phaseIdx === 1 && (
          <div className="flex gap-2 mt-3">
            <a
              href="App-prefs:root=DISPLAY"
              className="text-xs font-bold uppercase tracking-wider px-3 py-1 border border-white hover:bg-white hover:text-[#0A0A0A] transition-colors"
            >
              iOS Settings →
            </a>
            <a
              href="intent://settings"
              className="text-xs font-bold uppercase tracking-wider px-3 py-1 border border-white hover:bg-white hover:text-[#0A0A0A] transition-colors"
            >
              Android Settings →
            </a>
          </div>
        )}
      </div>
      <div className="flex-shrink-0 text-right">
        {isUpcoming ? (
          <p className="font-mono font-black text-2xl text-white leading-none">{countdown}</p>
        ) : (
          <div className="flex flex-col items-end gap-1">
            <div className="w-3 h-3 bg-[#E8FF00] animate-pulse" />
            <p className="text-xs font-bold uppercase tracking-wider text-[#E8FF00]">ACTIVE NOW</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Performance Summary ───────────────────────────────────────────────────────

function PerformanceSummary({ report }: { report: PerformanceReport }) {
  const { pmc, polarized, vdot, decoupling, sleepPerf } = report;
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
        {vdot.vdot ? (
          <>
            <p className="font-mono font-black text-5xl leading-none mb-2">{vdot.vdot}</p>
            <p className="text-xs text-[#6B6B6B] dark:text-[#A0A0A0]">{vdot.diagnosis}</p>
            {vdot.paces && (
              <p className="font-mono text-xs text-[#6B6B6B] dark:text-[#A0A0A0] mt-2">
                T-pace: <span className="text-[#0A0A0A] dark:text-[#F5F5F5] font-bold">{vdot.paces.thresholdPaceMinKm}</span>
              </p>
            )}
          </>
        ) : (
          <p className="text-xs text-[#6B6B6B] dark:text-[#A0A0A0]">Sync a race or maximal effort to calculate VDOT.</p>
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
        <p className="text-xs text-[#6B6B6B] dark:text-[#A0A0A0]">Avg decoupling — lower is better</p>
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

// ── Main Dashboard ────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { status } = useSession();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"sleep" | "performance">("sleep");
  const [stravaStatus, setStravaStatus] = useState<{ connected: boolean; recentActivities?: { name: string; startDate: string; distance: number; averageSpeed: number; averageHeartrate?: number | null }[] } | null>(null);
  const [perfReport, setPerfReport] = useState<PerformanceReport | null>(null);
  const [perfLoading, setPerfLoading] = useState(false);

  const [streakData, setStreakData] = useState<any>(null);
  const [morningCardDismissed, setMorningCardDismissed] = useState(false);
  const [interventionDismissed, setInterventionDismissed] = useState(false);

  const [dismissedDays, setDismissedDays] = useState<string[]>([]);
  const [selectedDay, setSelectedDay] = useState<DailySleepPlan | null>(null);
  const [selectedDayActivity, setSelectedDayActivity] = useState<any | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated") return;
    Promise.all([
      fetch("/api/sleep-plan", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/strava/status").then((r) => r.json()),
      fetch("/api/sleep-log/streak").then((r) => r.json()),
    ]).then(([sleepData, stravaData, streak]) => {
      if (sleepData.redirect) {
        router.push(sleepData.redirect);
        return;
      }
      setData(sleepData);
      setStravaStatus(stravaData);
      setStreakData(streak);
      setLoading(false);
    });
  }, [status, router]);

  useEffect(() => {
    if (activeTab !== "performance" || !stravaStatus?.connected) return;
    if (perfReport) return;
    setPerfLoading(true);
    fetch("/api/analysis?days=90")
      .then((r) => r.json())
      .then((d) => { if (!d.error) setPerfReport(d); })
      .finally(() => setPerfLoading(false));
  }, [activeTab, stravaStatus, perfReport]);

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

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen bg-white dark:bg-[#1a1a1a] flex items-center justify-center">
        <p className="font-mono text-sm uppercase tracking-wider text-[#6B6B6B]">Loading…</p>
      </div>
    );
  }

  if (!data) return null;

  const { plan, meets, meetPredictions = {} } = data;
  const today = plan[0] as DailySleepPlan;

  const week = Array.from({ length: 7 }, (_, i) => plan[i] ?? null);

  const nextMeet = meets?.find((m: any) => new Date(m.date) >= new Date());

  const recoveryScore = today.recoveryScore;

  // Recovery factor text for Race Readiness card
  const recoveryFactorText = recoveryScore >= 80
    ? "Peak readiness. Ready to race."
    : today.recoveryFactors?.length > 0
    ? today.recoveryFactors[0]
    : recoveryScore >= 60
    ? "Moderate fatigue accumulating."
    : "High fatigue. Prioritize rest.";

  const recoveryBarColor = recoveryScore >= 80 ? "#E8FF00" : recoveryScore >= 50 ? "#6B6B6B" : "#FF6B6B";

  const nextMeetPred: PerformancePrediction | null = nextMeet ? (meetPredictions[nextMeet.id] ?? null) : null;

  const subscriptionStatus = data?.user?.subscriptionStatus as string | null | undefined;
  const trialEndsAt = data?.user?.trialEndsAt ? new Date(data.user.trialEndsAt) : null;
  const trialDaysLeft = trialEndsAt
    ? Math.max(0, Math.ceil((trialEndsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

  return (
    <div className="min-h-screen bg-white dark:bg-[#1a1a1a]">
      <Navbar />

      {/* Subscription banner */}
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
      {subscriptionStatus !== "trialing" && subscriptionStatus !== "active" && (
        <div className="bg-[#E8FF00] px-6 py-3 flex items-center justify-between">
          <p className="font-black text-xs uppercase tracking-widest text-[#0A0A0A]">
            Start your 30-day free trial to unlock PRform
          </p>
          <a
            href="/subscribe"
            className="bg-[#0A0A0A] text-white font-black text-[10px] uppercase tracking-widest px-4 py-2 hover:bg-[#333] transition-colors shrink-0 ml-4"
          >
            Subscribe →
          </a>
        </div>
      )}

      {/* Tab toggle */}
      <div className="border-b border-[#E5E5E5] dark:border-[#333] px-6">
        <div className="max-w-[1200px] mx-auto flex">
          {(["sleep", "performance"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-3 text-xs font-black uppercase tracking-widest transition-colors border-b-2 ${
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

      {/* Performance tab */}
      {activeTab === "performance" && (
        <div className="max-w-[1200px] mx-auto px-6 py-10">
          {!stravaStatus?.connected ? (
            <FadeUp>
              <div className="border border-[#E5E5E5] dark:border-[#333] p-10 text-center max-w-lg mx-auto">
                <h2 className="font-black text-2xl uppercase mb-3">Connect Strava</h2>
                <p className="text-sm text-[#6B6B6B] dark:text-[#A0A0A0] mb-6">Sync your runs to unlock performance analysis.</p>
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
              <PerformanceSummary report={perfReport} />
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

      {activeTab === "sleep" && (
        <>
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

          {/* 2. Morning confirmation card */}
          {showMorning && !showIntervention && yesterdayPlan && (
            <MorningConfirmationCard
              yesterdayPlan={yesterdayPlan}
              onDismiss={() => setMorningCardDismissed(true)}
            />
          )}

          {/* 3. Hero Card */}
          <motion.section
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
            className="bg-[#0A0A0A] text-white px-6 py-10"
          >
            <div className="max-w-[1200px] mx-auto grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
              {/* Left: bedtime */}
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] mb-3">Tonight&apos;s Target</p>
                <MonoClock
                  time24={today.recommendedBedtime}
                  accent
                  animate
                  className="text-6xl md:text-8xl font-black leading-none block mb-3"
                />
                <p className="text-[#AAAAAA] text-sm uppercase tracking-wider">Fall asleep by</p>
                <p className="text-[#6B6B6B] text-xs mt-2 font-mono">
                  Wake: <MonoClock time24={today.recommendedWakeTime} className="inline text-white" />
                </p>
                <p className="text-[#6B6B6B] text-xs mt-1 font-mono">
                  {today.totalSleepHours}h sleep target tonight
                </p>
                {/* Circadian drift note — inline, conditional */}
                {today.circadianDelayMinutes > 30 && (
                  <div className="mt-3">
                    <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#b8cc00" }}>
                      CIRCADIAN DRIFT DETECTED
                    </span>
                    <p className="text-[10px] font-mono text-[#6B6B6B] mt-0.5">
                      Ramp adjusted for {Math.round(today.circadianDelayMinutes / 60 * 10) / 10}hr circadian delay
                    </p>
                  </div>
                )}
              </div>

              {/* Right: next meet */}
              <div
                className="cursor-pointer hover:opacity-80 transition-opacity duration-150"
                onClick={() => router.push("/meets")}
              >
                {nextMeet ? (
                  <div className="border border-[#333] p-6">
                    <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] mb-4">Next Meet</p>
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-black text-2xl mb-1">{nextMeet.name}</p>
                        <p className="text-[#AAAAAA] text-sm mb-3">{formatDate(nextMeet.date)}</p>
                        <Badge label={`${nextMeet.priority} Race`} variant={nextMeet.priority as "A" | "B" | "C"} />
                      </div>
                      <div className="text-right">
                        <p className="font-mono font-black text-6xl text-[#E8FF00] leading-none">
                          {today.daysUntilNextMeet ?? "0"}
                        </p>
                        <p className="text-[#6B6B6B] text-xs uppercase tracking-wider mt-1">days away</p>
                        {nextMeet.raceTime && today.daysUntilNextMeet !== null && today.daysUntilNextMeet <= 10 && (
                          <p className="text-[#6B6B6B] text-xs font-mono uppercase tracking-wider mt-1">
                            RACE AT {formatTime12h(nextMeet.raceTime)}
                          </p>
                        )}
                      </div>
                    </div>
                    {today.daysUntilNextMeet !== null && today.daysUntilNextMeet <= 10 && (
                      <p className="mt-4 text-xs text-[#E8FF00] font-bold uppercase tracking-wider">
                        Sleep shift in progress ↗
                      </p>
                    )}
                    {/* Prediction block */}
                    {(() => {
                      const pred: PerformancePrediction | null = meetPredictions[nextMeet.id] ?? null;
                      if (pred) {
                        const isSlower = pred.timeDifference > 0.5;
                        const isFaster = pred.timeDifference < -0.5;
                        const diffColor = isSlower ? "text-[#FF6B6B]" : isFaster ? "text-[#E8FF00]" : "text-[#6B6B6B]";
                        const refLabel = pred.referenceLabel === "Season Best" ? "SB" : "PR";
                        return (
                          <div className="mt-5 pt-4 border-t border-[#222]">
                            <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#6B6B6B] mb-2">Predicted Finish</p>
                            <p className="font-mono font-black text-3xl text-white leading-none mb-1">
                              {formatTimeFromSeconds(pred.predictedTime, pred.unit)}
                            </p>
                            <p className={`font-mono text-sm ${diffColor}`}>
                              {isSlower || isFaster
                                ? `${formatTimeDifference(pred.timeDifference)} vs ${refLabel}`
                                : `On track for ${refLabel}`}
                            </p>
                            <p className="text-[9px] font-mono text-[#444] mt-2">
                              Based on {pred.confidenceNights}/{pred.totalNights} nights of sleep data
                              {pred.isEstimated ? " (estimated)" : ""}
                            </p>
                          </div>
                        );
                      }
                      if (nextMeet.primaryEvent && !(nextMeet.recentBest || nextMeet.personalBest)) {
                        return (
                          <div className="mt-5 pt-4 border-t border-[#222]">
                            <button
                              onClick={(e) => { e.stopPropagation(); router.push(`/meets?edit=${nextMeet.id}`); }}
                              className="text-xs font-bold uppercase tracking-wider text-[#6B6B6B] hover:text-white px-3 py-2 border border-[#333] hover:border-[#555] transition-colors"
                            >
                              ADD PR →
                            </button>
                          </div>
                        );
                      }
                      if (!nextMeet.primaryEvent) {
                        return (
                          <div className="mt-5 pt-4 border-t border-[#222]">
                            <button
                              onClick={(e) => { e.stopPropagation(); router.push(`/meets?edit=${nextMeet.id}`); }}
                              className="text-xs font-bold uppercase tracking-wider text-[#6B6B6B] hover:text-white px-3 py-2 border border-[#333] hover:border-[#555] transition-colors"
                            >
                              ADD EVENT + PR →
                            </button>
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </div>
                ) : (
                  <div className="border border-[#333] p-6 flex items-center justify-center">
                    <p className="text-[#6B6B6B] text-sm uppercase tracking-wider">No upcoming meets</p>
                  </div>
                )}
              </div>
            </div>
          </motion.section>

          {/* 4. Wind-Down — single active phase */}
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
                    {data.user?.sport === "swimming" ? "Swimming" : "Track & Field"}
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
                            <div key={i} className={`flex-1 p-4 min-w-[100px] ${isToday ? "bg-[#0A0A0A] text-white" : "bg-white dark:bg-[#242424]"}`}>
                              <p className={`text-xs font-bold uppercase tracking-wider mb-3 ${isToday ? "text-[#E8FF00]" : "text-[#6B6B6B] dark:text-[#A0A0A0]"}`}>{isToday ? "TODAY" : DAYS[i]}</p>
                              <p className="text-xs text-[#6B6B6B] dark:text-[#A0A0A0]">Rest</p>
                            </div>
                          );
                          return (
                            <FadeUp key={dateStr ?? i} delay={i * 50} className="flex-1 min-w-[100px]">
                              <div
                                className={`relative group p-4 h-full cursor-pointer border-2 transition-colors duration-150 ${
                                  isToday
                                    ? "bg-[#0A0A0A] text-white border-transparent hover:border-[#E8FF00]"
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
                                <p className={`text-xs font-bold uppercase tracking-wider mb-3 ${isToday ? "text-[#E8FF00]" : "text-[#6B6B6B] dark:text-[#A0A0A0]"}`}>
                                  {isToday ? "TODAY" : DAYS[(new Date(d.date).getDay() + 6) % 7]}
                                </p>
                                <MonoClock
                                  time24={d.recommendedBedtime}
                                  className={`text-base font-black block mb-1 ${isToday ? "text-[#E8FF00]" : ""}`}
                                  animate={isToday}
                                />
                                <p className={`text-xs font-mono mb-2 ${isToday ? "text-[#AAAAAA]" : "text-[#6B6B6B] dark:text-[#A0A0A0]"}`}>
                                  Wake <MonoClock time24={d.recommendedWakeTime} className="inline" />
                                </p>
                                {(() => {
                                  const isConfirmedPast = d.sleepConfirmed && d.actualSleepHours != null;
                                  const displayHours = isConfirmedPast ? d.actualSleepHours : d.totalSleepHours;
                                  const hoursLabel = isConfirmedPast ? "actual" : "target";
                                  return (
                                    <>
                                      <p className={`text-xs font-bold mb-1 ${isToday ? "text-[#CCCCCC]" : "text-[#6B6B6B] dark:text-[#A0A0A0]"}`}>
                                        {displayHours}h
                                      </p>
                                      <p className={`text-[10px] font-mono mb-2 ${isToday ? "text-[#6B6B6B]" : "text-[#AAAAAA] dark:text-[#555]"}`}>
                                        {hoursLabel}
                                      </p>
                                      {isToday && !yesterdayPlan?.sleepConfirmed && (
                                        <a
                                          href="/sleep"
                                          onClick={(e) => e.stopPropagation()}
                                          className="block text-[9px] font-bold uppercase tracking-widest text-[#E8FF00] hover:text-white transition-colors mb-2"
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

          {/* 6. Race Readiness Card */}
          <section className="px-6 py-10 border-b border-[#E5E5E5] dark:border-[#333]">
            <div className="max-w-[1200px] mx-auto">
              <FadeUp>
                <div className="bg-[#0A0A0A] text-white border border-[#333333] p-6">
                  <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#6B6B6B] mb-6">RACE READINESS</p>
                  <div className="grid grid-cols-2 gap-6">
                    {/* Left: Recovery */}
                    <div className="border-r border-[#333333] pr-6">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[#6B6B6B] mb-2">RECOVERY</p>
                      <div className="flex items-end gap-2 mb-1">
                        <p className="font-mono font-black text-4xl leading-none">{recoveryScore}</p>
                        <p className="text-[#6B6B6B] text-lg mb-1">/ 100</p>
                      </div>
                      <p className="text-xs font-mono text-[#6B6B6B] mt-1 mb-3">{recoveryFactorText}</p>
                      <div className="w-full h-0.5 bg-[#333333]">
                        <div
                          className="h-0.5 transition-all duration-700"
                          style={{ width: `${recoveryScore}%`, backgroundColor: recoveryBarColor }}
                        />
                      </div>
                    </div>

                    {/* Right: Race Prediction */}
                    <div>
                      {nextMeetPred ? (
                        (() => {
                          const isSlower = nextMeetPred.timeDifference > 0.5;
                          const isFaster = nextMeetPred.timeDifference < -0.5;
                          const diffColor = isSlower ? "#FF6B6B" : isFaster ? "#E8FF00" : "#6B6B6B";
                          const refLabel = nextMeetPred.referenceLabel === "Season Best" ? "SB" : "PR";
                          const daysOut = Math.round((new Date(nextMeet.date).getTime() - Date.now()) / 86400000);
                          return (
                            <>
                              <p className="text-[10px] font-bold uppercase tracking-wider text-[#6B6B6B] mb-2">PREDICTED FINISH</p>
                              <p className="font-mono font-black text-4xl leading-none mb-1">
                                {formatTimeFromSeconds(nextMeetPred.predictedTime, nextMeetPred.unit)}
                              </p>
                              <p className="text-xs font-mono mt-1" style={{ color: diffColor }}>
                                {isSlower || isFaster
                                  ? `${formatTimeDifference(nextMeetPred.timeDifference)} vs ${refLabel}`
                                  : `On track for ${refLabel}`}
                              </p>
                              <p className="text-[10px] font-mono text-[#6B6B6B] mt-2">
                                Based on {nextMeetPred.confidenceNights} nights of sleep data
                              </p>
                              <p className="text-[10px] font-mono text-[#6B6B6B]">
                                {nextMeet.name} · {daysOut} days away
                              </p>
                            </>
                          );
                        })()
                      ) : (
                        <>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-[#6B6B6B] mb-2">RACE PREDICTION</p>
                          <p className="text-sm font-mono text-[#6B6B6B] mb-3">Add your event and PR to a meet</p>
                          <a
                            href="/meets"
                            className="inline-block text-xs font-bold uppercase tracking-wider text-[#6B6B6B] border border-[#333] px-3 py-1.5 hover:border-[#555] hover:text-white transition-colors"
                          >
                            SET UP →
                          </a>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="mt-6 pt-4 border-t border-[#333333]">
                    <a href="/schedule?tab=history" className="text-[10px] font-mono text-[#6B6B6B] hover:text-white transition-colors">
                      View sleep history →
                    </a>
                  </div>
                </div>
              </FadeUp>
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
