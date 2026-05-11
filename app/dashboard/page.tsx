"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { motion } from "framer-motion";
import { FadeUp } from "@/components/FadeUp";
import { MonoClock } from "@/components/MonoClock";
import { WindDownTimeline } from "@/components/WindDownTimeline";
import { Badge } from "@/components/Badge";
import { Navbar } from "@/components/Navbar";
import type { DailySleepPlan, CircadianPlan } from "@/lib/sleepAlgorithm";
import { formatTime12h } from "@/lib/sleepAlgorithm";
import type { PerformanceReport } from "@/lib/performanceAnalysis";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const LOAD_COLORS = {
  low: "bg-green-500",
  medium: "bg-yellow-400",
  high: "bg-red-500",
};

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function getTodayIndex(): number {
  return (new Date().getDay() + 6) % 7;
}

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
          {/* CBTmin anchor */}
          <FadeUp className="bg-white p-6">
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] mb-3">CBTmin Anchor</p>
            <p className="font-mono font-black text-5xl leading-none mb-2">
              {formatTime12h(circadian.cbtMin)}
            </p>
            <p className="text-xs text-[#6B6B6B] uppercase tracking-wider mb-4">Core body temp minimum</p>
            <div className="space-y-1 text-xs font-mono text-[#6B6B6B]">
              <p><span className="text-[#E8FF00] bg-[#0A0A0A] px-1">ADVANCE ZONE</span> after {formatTime12h(circadian.advanceWindowStart)}</p>
              <p><span className="text-red-400 bg-[#0A0A0A] px-1">DELAY ZONE</span> before {formatTime12h(circadian.delayZoneEnd)}</p>
            </div>
          </FadeUp>

          {/* Light prescription */}
          <FadeUp delay={60} className="bg-[#0A0A0A] text-white p-6">
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] mb-3">Light Prescription</p>
            <div className="flex items-end gap-2 mb-1">
              <p className="font-mono font-black text-4xl leading-none text-[#E8FF00]">
                {formatTime12h(circadian.lightExposure.start)}
              </p>
              <p className="text-[#6B6B6B] text-sm mb-1 font-mono">→ {formatTime12h(circadian.lightExposure.end)}</p>
            </div>
            <p className="text-xs text-[#6B6B6B] uppercase tracking-wider mb-4">
              {circadian.lightExposure.durationMin} min &middot; {circadian.lightExposure.type === "outdoor" ? "Outdoor sunlight" : "10,000 lux lamp"}
            </p>
            <p className="text-xs text-[#AAAAAA] font-mono leading-relaxed">{circadian.lightExposure.instruction}</p>
          </FadeUp>

          {/* Shift progress */}
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

function PerformanceSummary({ report }: { report: PerformanceReport }) {
  const { pmc, polarized, vdot, decoupling, sleepPerf } = report;
  return (
    <div className="space-y-px bg-[#E5E5E5]">
      {/* CTL / ATL / TSB */}
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
        <p className="text-xs text-[#6B6B6B] mt-4 border-l-2 border-[#E8FF00] pl-3">{pmc.interpretation}</p>
      </div>

      {/* Zone distribution */}
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

      {/* VDOT */}
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

      {/* Decoupling */}
      <div className="bg-white p-6">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] mb-2">Aerobic Efficiency</p>
        <div className="flex items-end gap-3 mb-2">
          <p className="font-mono font-black text-4xl leading-none">{decoupling.rollingAvgDecoupling}%</p>
          <p className={`text-xs font-bold uppercase tracking-wider mb-1 ${decoupling.trend === "improving" ? "text-green-600" : decoupling.trend === "declining" ? "text-red-500" : "text-[#6B6B6B]"}`}>
            {decoupling.trend === "improving" ? "↓ Improving" : decoupling.trend === "declining" ? "↑ Declining" : "→ Stable"}
          </p>
        </div>
        <p className="text-xs text-[#6B6B6B]">Avg decoupling — lower is better</p>
      </div>

      {/* Sleep-pace headline */}
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

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"sleep" | "performance">("sleep");
  const [stravaStatus, setStravaStatus] = useState<{ connected: boolean } | null>(null);
  const [perfReport, setPerfReport] = useState<PerformanceReport | null>(null);
  const [perfLoading, setPerfLoading] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/sleep-plan")
      .then((r) => r.json())
      .then((d) => {
        if (d.redirect) {
          router.push(d.redirect);
          return;
        }
        setData(d);
        setLoading(false);
      });
    fetch("/api/strava/status")
      .then((r) => r.json())
      .then((s) => setStravaStatus(s));
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

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <p className="font-mono text-sm uppercase tracking-wider text-[#6B6B6B]">Loading...</p>
      </div>
    );
  }

  if (!data) return null;

  const { plan, meets, conflicts } = data;
  const today = plan[0] as DailySleepPlan;
  const todayIndex = getTodayIndex();

  // Build 7-day display from plan, padded to 7 days
  const week = Array.from({ length: 7 }, (_, i) => plan[i] ?? null);

  const nextMeet = meets?.find((m: any) => new Date(m.date) >= new Date());

  const recoveryScore = today.recoveryScore;
  const recoveryLabel = recoveryScore >= 80 ? "Peak readiness. You are primed to run a PR." : recoveryScore >= 60 ? "Moderate fatigue accumulating. Follow your wind-down to protect meet-day performance." : "High fatigue. Prioritize rest to protect your PR window.";
  const fatigueBanner = (today as any).fatigueSleepBoost;

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
                <a
                  href="/api/strava/connect"
                  className="inline-block bg-[#E8FF00] text-[#0A0A0A] font-black text-xs uppercase tracking-widest px-8 py-3 hover:bg-[#d4e800] transition-colors"
                >
                  Connect Strava →
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
        </div>
      )}

      {activeTab === "sleep" && (
      <>
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

      {/* Circadian Protocol — only shown during a PRC shift window */}
      {today.circadian && <CircadianProtocolSection circadian={today.circadian} />}

      {/* Conflict banner — shown when a Strava activity and manual workout collide */}
      {conflicts?.length > 0 && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-3">
          <div className="max-w-[1200px] mx-auto flex items-center justify-between flex-wrap gap-2">
            <p className="text-xs font-bold uppercase tracking-wider text-amber-800">
              {conflicts.length} workout conflict{conflicts.length > 1 ? "s" : ""} — Strava and manual entries overlap.
            </p>
            <a href="/schedule" className="text-xs font-bold uppercase tracking-wider text-amber-900 underline">
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
                      {/* Source badge */}
                      {source && source !== "rest" && (
                        <div className="flex items-center gap-1 mt-1">
                          <div className={`w-1.5 h-1.5 rounded-full ${source === "strava" ? "bg-[#FC4C02]" : source === "manual" ? "bg-blue-400" : "bg-[#6B6B6B]"}`} />
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
          </FadeUp>

          {/* Upcoming Meets */}
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
                        {daysOut <= 10 && daysOut > 0 && (
                          <p className="text-xs text-[#E8FF00] bg-[#0A0A0A] inline-block px-2 py-0.5 mt-1 font-bold uppercase tracking-wider">
                            Begin sleep shift in {Math.max(0, daysOut - 10)} days
                          </p>
                        )}
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
    </div>
  );
}
