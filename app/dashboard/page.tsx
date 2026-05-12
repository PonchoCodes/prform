"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import { FadeUp } from "@/components/FadeUp";
import { Footer } from "@/components/Footer";
import { MonoClock } from "@/components/MonoClock";
import { WindDownTimeline } from "@/components/WindDownTimeline";
import { Badge } from "@/components/Badge";
import { Navbar } from "@/components/Navbar";
import type { DailySleepPlan, CircadianPlan } from "@/lib/sleepAlgorithm";
import { formatTime12h } from "@/lib/sleepAlgorithm";
import type { PerformanceReport } from "@/lib/performanceAnalysis";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const LOAD_COLORS = {
  low: "bg-[#E5E5E5]",
  medium: "bg-[#6B6B6B]",
  high: "bg-[#0A0A0A]",
};

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function getTodayIndex(): number {
  return (new Date().getDay() + 6) % 7;
}

function parseTimeMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function minutesToTime(min: number): string {
  const total = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

// ── Morning Confirmation Card ─────────────────────────────────────────────────

interface MorningCardProps {
  yesterdayPlan: DailySleepPlan;
  onDismiss: () => void;
}

function MorningConfirmationCard({ yesterdayPlan, onDismiss }: MorningCardProps) {
  const [phase, setPhase] = useState<"question" | "miss" | "submitting" | "done">("question");
  const [actualBedtime, setActualBedtime] = useState(() => {
    // Default: 30 min after recommended
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
                      <a href="/sleep-history" className="underline hover:text-white">sleep history</a>.
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
                      <a href="/sleep-history" className="underline hover:text-white">sleep history</a>.
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
  onAdjust: (result: any) => void;
  onKeep: () => void;
  onRemindLater: () => void;
}

function InterventionCard({
  consecutiveMisses,
  avgDeviationMinutes,
  recommendedBedtime,
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
  const secondsLost = Math.round((impactPct / 100) * 285); // ~285s/km default threshold pace

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
                  {impactPct}%. That&apos;s approximately {secondsLost}s per km on your current threshold pace.
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

// ── Circadian Protocol ────────────────────────────────────────────────────────

function CircadianProtocolSection({ circadian }: { circadian: CircadianPlan }) {
  return (
    <section className="border-b border-[#E5E5E5] px-6 py-10">
      <div className="max-w-[1200px] mx-auto">
        <FadeUp>
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] mb-2">Phase Response Curve</p>
          <h2 className="font-black text-2xl uppercase mb-1">Circadian Protocol</h2>
          <p className="text-xs text-[#6B6B6B] font-mono mb-8 max-w-xl">{circadian.mechanismNote}</p>
        </FadeUp>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-[#E5E5E5]">
          <FadeUp className="bg-white p-6">
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] mb-3">CBTmin Anchor</p>
            <p className="font-mono font-black text-5xl leading-none mb-2">{formatTime12h(circadian.cbtMin)}</p>
            <p className="text-xs text-[#6B6B6B] uppercase tracking-wider mb-4">Core body temp minimum</p>
            <div className="space-y-1 text-xs font-mono text-[#6B6B6B]">
              <p><span className="text-[#E8FF00] bg-[#0A0A0A] px-1">ADVANCE ZONE</span> after {formatTime12h(circadian.advanceWindowStart)}</p>
              <p><span className="text-red-400 bg-[#0A0A0A] px-1">DELAY ZONE</span> before {formatTime12h(circadian.delayZoneEnd)}</p>
            </div>
          </FadeUp>

          <FadeUp delay={60} className="bg-[#0A0A0A] text-white p-6">
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] mb-3">Light Prescription</p>
            <div className="flex items-end gap-2 mb-1">
              <p className="font-mono font-black text-4xl leading-none text-[#E8FF00]">{formatTime12h(circadian.lightExposure.start)}</p>
              <p className="text-[#6B6B6B] text-sm mb-1 font-mono">→ {formatTime12h(circadian.lightExposure.end)}</p>
            </div>
            <p className="text-xs text-[#6B6B6B] uppercase tracking-wider mb-4">
              {circadian.lightExposure.durationMin} min &middot; {circadian.lightExposure.type === "outdoor" ? "Outdoor sunlight" : "10,000 lux lamp"}
            </p>
            <p className="text-xs text-[#AAAAAA] font-mono leading-relaxed">{circadian.lightExposure.instruction}</p>
          </FadeUp>

          <FadeUp delay={120} className="bg-white p-6">
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] mb-3">Shift Progress</p>
            <div className="flex items-end gap-2 mb-4">
              <p className="font-mono font-black text-5xl leading-none">{circadian.cumulativeShiftMin}</p>
              <p className="text-[#6B6B6B] text-sm mb-1">min advanced</p>
            </div>
            <div className="w-full h-1.5 bg-[#E5E5E5] mb-4">
              <div
                className="h-1.5 bg-[#E8FF00] transition-all duration-700"
                style={{ width: `${Math.min(100, (circadian.cumulativeShiftMin / Math.max(circadian.cumulativeShiftMin, 90)) * 100)}%` }}
              />
            </div>
            <div className="space-y-1 text-xs font-mono text-[#6B6B6B]">
              <p>+{circadian.dailyShiftMin} min today &rarr; target {formatTime12h(circadian.targetWakeTime)} wake</p>
              <p className="text-[#0A0A0A] font-bold uppercase tracking-wider mt-3">
                Dim lights after {formatTime12h(circadian.lightAvoidStart)}
              </p>
            </div>
          </FadeUp>
        </div>
      </div>
    </section>
  );
}

// ── Performance Summary ───────────────────────────────────────────────────────

function PerformanceSummary({ report }: { report: PerformanceReport }) {
  const { pmc, polarized, vdot, decoupling, sleepPerf } = report;
  return (
    <div className="space-y-px bg-[#E5E5E5]">
      <div className="bg-white p-6">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] mb-4">Training Load</p>
        <div className="grid grid-cols-3 gap-6">
          {[["CTL", pmc.currentCTL, "Fitness"], ["ATL", pmc.currentATL, "Fatigue"], ["TSB", (pmc.currentTSB > 0 ? "+" : "") + pmc.currentTSB, "Form"]].map(([l, v, s]) => (
            <div key={l as string}>
              <p className="text-xs text-[#6B6B6B] uppercase tracking-wider mb-1">{l}</p>
              <p className="font-mono font-black text-3xl leading-none">{v}</p>
              <p className="text-xs text-[#6B6B6B] mt-1">{s}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-[#6B6B6B] mt-4 bg-[#F5F5F5] px-3 py-2">{pmc.interpretation}</p>
      </div>

      <div className="bg-white p-6">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] mb-4">Intensity Distribution</p>
        <div className="grid grid-cols-3 gap-4 mb-4">
          {[["Z1", polarized.zone1Pct], ["Z2", polarized.zone2Pct], ["Z3", polarized.zone3Pct]].map(([z, p]) => (
            <div key={z as string}>
              <p className="text-xs text-[#6B6B6B] uppercase tracking-wider">{z}</p>
              <p className="font-mono font-black text-2xl">{p}%</p>
            </div>
          ))}
        </div>
        <div className="w-full h-3 flex">
          <div className="h-full bg-white border border-[#E5E5E5]" style={{ width: `${polarized.zone1Pct}%` }} />
          <div className="h-full bg-[#6B6B6B]" style={{ width: `${polarized.zone2Pct}%` }} />
          <div className="h-full bg-[#E8FF00]" style={{ width: `${polarized.zone3Pct}%` }} />
        </div>
      </div>

      <div className="bg-white p-6">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] mb-2">VDOT</p>
        {vdot.vdot ? (
          <>
            <p className="font-mono font-black text-5xl leading-none mb-2">{vdot.vdot}</p>
            <p className="text-xs text-[#6B6B6B]">{vdot.diagnosis}</p>
            {vdot.paces && (
              <p className="font-mono text-xs text-[#6B6B6B] mt-2">
                T-pace: <span className="text-[#0A0A0A] font-bold">{vdot.paces.thresholdPaceMinKm}/km</span>
              </p>
            )}
          </>
        ) : (
          <p className="text-xs text-[#6B6B6B]">Sync a race or maximal effort to calculate VDOT.</p>
        )}
      </div>

      <div className="bg-white p-6">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] mb-2">Aerobic Efficiency</p>
        <div className="flex items-end gap-3 mb-2">
          <p className="font-mono font-black text-4xl leading-none">{decoupling.rollingAvgDecoupling}%</p>
          <p className="text-xs font-bold uppercase tracking-wider mb-1 text-[#6B6B6B]">
            {decoupling.trend === "improving" ? "↓ Improving" : decoupling.trend === "declining" ? "↑ Declining" : "→ Stable"}
          </p>
        </div>
        <p className="text-xs text-[#6B6B6B]">Avg decoupling — lower is better</p>
      </div>

      <div className="bg-white p-6">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] mb-2">Sleep × Pace</p>
        <p className="font-mono font-black text-2xl leading-none mb-2">r = {sleepPerf.correlation}</p>
        <p className="text-xs text-[#6B6B6B] leading-relaxed">{sleepPerf.insight}</p>
      </div>

      <div className="bg-white p-6">
        <a href="/analysis" className="inline-block border border-[#0A0A0A] text-[#0A0A0A] font-black text-xs uppercase tracking-widest px-6 py-2 hover:bg-[#0A0A0A] hover:text-white transition-colors">
          Full Analysis →
        </a>
      </div>
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"sleep" | "performance">("sleep");
  const [stravaStatus, setStravaStatus] = useState<{ connected: boolean } | null>(null);
  const [perfReport, setPerfReport] = useState<PerformanceReport | null>(null);
  const [perfLoading, setPerfLoading] = useState(false);

  // Morning card / intervention card state
  const [streakData, setStreakData] = useState<any>(null);
  const [morningCardDismissed, setMorningCardDismissed] = useState(false);
  const [interventionDismissed, setInterventionDismissed] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated") return;
    Promise.all([
      fetch("/api/sleep-plan").then((r) => r.json()),
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

  // Determine which card to show
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
      <div className="min-h-screen bg-white flex items-center justify-center">
        <p className="font-mono text-sm uppercase tracking-wider text-[#6B6B6B]">Loading…</p>
      </div>
    );
  }

  if (!data) return null;

  const { plan, meets, conflicts } = data;
  const today = plan[0] as DailySleepPlan;

  const week = Array.from({ length: 7 }, (_, i) => plan[i] ?? null);

  const nextMeet = meets?.find((m: any) => new Date(m.date) >= new Date());

  const recoveryScore = today.recoveryScore;
  const recoveryLabel = recoveryScore >= 80
    ? "Peak readiness. You are primed to run a PR."
    : recoveryScore >= 60
    ? "Moderate fatigue accumulating. Follow your wind-down to protect meet-day performance."
    : "High fatigue. Prioritize rest to protect your PR window.";
  const fatigueBanner = (today as any).fatigueSleepBoost;
  const planAgg = data.user?.planAggressiveness ?? 85;

  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      {/* Tab toggle */}
      <div className="border-b border-[#E5E5E5] px-6">
        <div className="max-w-[1200px] mx-auto flex">
          {(["sleep", "performance"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-3 text-xs font-black uppercase tracking-widest transition-colors border-b-2 ${
                activeTab === tab
                  ? "border-[#0A0A0A] text-[#0A0A0A]"
                  : "border-transparent text-[#6B6B6B] hover:text-[#0A0A0A]"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Fatigue boost banner */}
      {activeTab === "sleep" && fatigueBanner && (
        <div className="bg-[#0A0A0A] text-white px-6 py-3">
          <div className="max-w-[1200px] mx-auto">
            <p className="text-xs font-bold uppercase tracking-wider text-[#E8FF00] mb-0.5">High Training Load Detected</p>
            <p className="text-xs font-mono text-[#AAAAAA]">
              Your training stress is elevated with {today.daysUntilNextMeet} days until {today.nextMeetName}.
              PRform has added {(today as any).fatigueSleepBoostMinutes} minutes to your sleep target tonight to accelerate recovery.
            </p>
          </div>
        </div>
      )}

      {/* Performance tab */}
      {activeTab === "performance" && (
        <div className="max-w-[1200px] mx-auto px-6 py-10">
          {!stravaStatus?.connected ? (
            <FadeUp>
              <div className="border border-[#E5E5E5] p-10 text-center max-w-lg mx-auto">
                <h2 className="font-black text-2xl uppercase mb-3">Connect Strava</h2>
                <p className="text-sm text-[#6B6B6B] mb-6">Sync your runs to unlock performance analysis.</p>
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
              <div className="border border-[#E5E5E5] p-8 text-center">
                <p className="text-sm text-[#6B6B6B] mb-4">Sync your Strava activities to generate performance data.</p>
                <a href="/strava" className="inline-block border border-[#0A0A0A] font-black text-xs uppercase tracking-widest px-6 py-2 hover:bg-[#0A0A0A] hover:text-white transition-colors">
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
          {/* Intervention card (takes precedence over morning card) */}
          {showIntervention && yesterdayPlan && (
            <InterventionCard
              consecutiveMisses={streakData.consecutiveMisses}
              avgDeviationMinutes={streakData.avgDeviationMinutes}
              recommendedBedtime={yesterdayPlan.recommendedBedtime}
              onAdjust={() => setInterventionDismissed(true)}
              onKeep={handleInterventionKeep}
              onRemindLater={handleInterventionRemindLater}
            />
          )}

          {/* Morning confirmation card */}
          {showMorning && !showIntervention && yesterdayPlan && (
            <MorningConfirmationCard
              yesterdayPlan={yesterdayPlan}
              onDismiss={() => setMorningCardDismissed(true)}
            />
          )}

          {/* Hero Card */}
          <motion.section
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
            className="bg-[#0A0A0A] text-white px-6 py-10"
          >
            <div className="max-w-[1200px] mx-auto grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
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
              </div>

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
                </div>
              ) : (
                <div className="border border-[#333] p-6 flex items-center justify-center">
                  <p className="text-[#6B6B6B] text-sm uppercase tracking-wider">No upcoming meets</p>
                </div>
              )}
            </div>
          </motion.section>

          {/* Wind-Down Timeline */}
          <section className="border-b border-[#E5E5E5] px-6 py-10">
            <div className="max-w-[1200px] mx-auto">
              <FadeUp>
                <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] mb-2">Tonight&apos;s Wind-Down</p>
                <h2 className="font-black text-2xl uppercase mb-6">3-Hour Protocol</h2>
              </FadeUp>
              <FadeUp delay={80}>
                <WindDownTimeline windDown={today.windDown} />
              </FadeUp>
            </div>
          </section>

          {today.circadian && <CircadianProtocolSection circadian={today.circadian} />}

          {/* Conflict banner */}
          {conflicts?.length > 0 && (
            <div className="bg-[#0A0A0A] border-b border-[#222] px-6 py-3">
              <div className="max-w-[1200px] mx-auto flex items-center justify-between flex-wrap gap-2">
                <p className="text-xs font-bold uppercase tracking-wider text-[#E8FF00]">
                  {conflicts.length} workout conflict{conflicts.length > 1 ? "s" : ""} — Strava and manual entries overlap.
                </p>
                <a href="/schedule" className="text-xs font-bold uppercase tracking-wider text-white underline hover:text-[#E8FF00] transition-colors">
                  Resolve in Schedule →
                </a>
              </div>
            </div>
          )}

          {/* This Week's Sleep Schedule */}
          <section className="px-6 py-10 border-b border-[#E5E5E5]">
            <div className="max-w-[1200px] mx-auto">
              <FadeUp>
                <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] mb-2">This Week</p>
                <div className="flex items-center gap-3 mb-6">
                  <h2 className="font-black text-2xl uppercase">Sleep Schedule</h2>
                  <span className="text-xs font-bold uppercase tracking-wider text-[#6B6B6B] border border-[#E5E5E5] px-2 py-1">
                    {data.user?.sport === "swimming" ? "Swimming" : "Track & Field"}
                  </span>
                </div>
              </FadeUp>
              <div className="overflow-x-auto">
                <div className="flex gap-px min-w-[700px] bg-[#E5E5E5]">
                  {week.map((day, i) => {
                    const isToday = i === 0;
                    const d = day as DailySleepPlan | null;
                    const source = d?.workoutSource;
                    const tentative = d?.isTentative;

                    if (!d) return (
                      <div key={i} className={`flex-1 p-4 min-w-[100px] ${isToday ? "bg-[#0A0A0A] text-white" : "bg-white"}`}>
                        <p className={`text-xs font-bold uppercase tracking-wider mb-3 ${isToday ? "text-[#E8FF00]" : "text-[#6B6B6B]"}`}>{DAYS[i]}</p>
                        <p className="text-xs text-[#6B6B6B]">Rest</p>
                      </div>
                    );
                    return (
                      <FadeUp key={i} delay={i * 50} className="flex-1 min-w-[100px]">
                        <div className={`p-4 h-full ${isToday ? "bg-[#0A0A0A] text-white" : "bg-white"}`}>
                          <p className={`text-xs font-bold uppercase tracking-wider mb-3 ${isToday ? "text-[#E8FF00]" : "text-[#6B6B6B]"}`}>
                            {isToday ? "Today" : DAYS[(new Date(d.date).getDay() + 6) % 7]}
                          </p>
                          <MonoClock
                            time24={d.recommendedBedtime}
                            className={`text-base font-black block mb-1 ${isToday ? "text-[#E8FF00]" : ""}`}
                            animate={isToday}
                          />
                          <p className={`text-xs font-mono mb-2 ${isToday ? "text-[#AAAAAA]" : "text-[#6B6B6B]"}`}>
                            Wake <MonoClock time24={d.recommendedWakeTime} className="inline" />
                          </p>
                          <p className={`text-xs font-bold mb-2 ${isToday ? "text-[#CCCCCC]" : "text-[#6B6B6B]"}`}>
                            {d.totalSleepHours}h
                          </p>
                          <div className="flex items-center gap-1.5 mb-2">
                            <div className={`w-2 h-2 ${LOAD_COLORS[d.trainingLoadLevel]}`} />
                            <span className={`text-xs uppercase tracking-wider ${isToday ? "text-[#6B6B6B]" : "text-[#AAAAAA]"}`}>
                              {d.trainingLoadLevel}
                            </span>
                          </div>
                          {source && source !== "rest" && (
                            <div className="flex items-center gap-1 mt-1">
                              <div className={`w-1.5 h-1.5 ${source === "strava" ? "bg-[#FC4C02]" : source === "manual" ? "bg-[#0A0A0A]" : "bg-[#E5E5E5]"}`} />
                              <span className={`text-[10px] font-mono uppercase ${isToday ? "text-[#6B6B6B]" : "text-[#AAAAAA]"}`}>
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
            </div>
          </section>

          {/* Plan Ahead card */}
          <section className="px-6 py-10 border-b border-[#E5E5E5]">
            <div className="max-w-[1200px] mx-auto">
              <FadeUp>
                <div className="border border-[#E5E5E5] p-6 flex items-center justify-between gap-6">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] mb-1">14-Day Outlook</p>
                    <h2 className="font-black text-xl uppercase">Plan Ahead</h2>
                    <p className="text-xs text-[#6B6B6B] mt-2 font-mono max-w-md">
                      Add planned workouts to your schedule so PRform can optimise sleep targets before they happen.
                    </p>
                  </div>
                  <a
                    href="/schedule"
                    className="flex-shrink-0 inline-block border border-[#0A0A0A] text-[#0A0A0A] font-black text-xs uppercase tracking-widest px-6 py-3 hover:bg-[#0A0A0A] hover:text-white transition-colors"
                  >
                    Open Schedule →
                  </a>
                </div>
              </FadeUp>
            </div>
          </section>

          {/* Recovery Score */}
          <section className="px-6 py-10 border-b border-[#E5E5E5]">
            <div className="max-w-[1200px] mx-auto grid grid-cols-1 md:grid-cols-2 gap-10">
              <FadeUp>
                <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] mb-2">Recovery</p>
                <h2 className="font-black text-2xl uppercase mb-6">Recovery Score</h2>
                <div className="flex items-end gap-4 mb-4">
                  <span className="font-mono font-black text-8xl leading-none">{recoveryScore}</span>
                  <span className="text-[#6B6B6B] text-sm uppercase tracking-wider mb-2">/ 100</span>
                </div>
                <div className="w-full h-2 bg-[#E5E5E5] mb-4">
                  <div
                    className="h-2 bg-[#0A0A0A] transition-all duration-700"
                    style={{ width: `${recoveryScore}%` }}
                  />
                </div>
                <p className="text-sm text-[#6B6B6B]">{recoveryLabel}</p>
                {planAgg < 100 && (
                  <p className="text-[10px] font-mono text-[#6B6B6B] mt-3 pl-3">
                    Plan running at {planAgg}% aggressiveness. Your theoretical maximum recovery score at 100% would be{" "}
                    {Math.min(100, Math.round(recoveryScore * (1 + (100 - planAgg) / 200)))}.
                  </p>
                )}
                <p className="text-[10px] font-mono text-[#6B6B6B] mt-2">
                  <a href="/sleep-history" className="underline hover:text-[#0A0A0A]">View sleep history →</a>
                </p>
              </FadeUp>

              <FadeUp delay={80}>
                <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] mb-2">Upcoming</p>
                <h2 className="font-black text-2xl uppercase mb-6">Meets</h2>
                {meets?.length ? (
                  <div className="space-y-3">
                    {meets.slice(0, 4).map((m: any) => {
                      const daysOut = Math.round((new Date(m.date).getTime() - Date.now()) / 86400000);
                      return (
                        <div key={m.id} className="border border-[#E5E5E5] p-4 flex items-center justify-between hover:border-[#0A0A0A] transition-colors">
                          <div>
                            <p className="font-bold text-sm">{m.name}</p>
                            <p className="text-xs text-[#6B6B6B] mt-0.5">{formatDate(m.date)}</p>
                          </div>
                          <div className="flex items-center gap-3">
                            <Badge label={m.priority} variant={m.priority as "A" | "B" | "C"} />
                            <span className="font-mono font-bold text-xl">{daysOut}</span>
                            <span className="text-xs text-[#6B6B6B] uppercase">days</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-[#6B6B6B] text-sm">No meets scheduled. <a href="/meets" className="font-bold text-[#0A0A0A] link-wipe">Add a meet →</a></p>
                )}
              </FadeUp>
            </div>
          </section>
        </>
      )}
      <Footer />
    </div>
  );
}
