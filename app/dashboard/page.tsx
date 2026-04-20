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
import type { DailySleepPlan } from "@/lib/sleepAlgorithm";

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

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

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
  }, [status, router]);

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <p className="font-mono text-sm uppercase tracking-wider text-[#6B6B6B]">Loading...</p>
      </div>
    );
  }

  if (!data) return null;

  const { plan, meets } = data;
  const today = plan[0] as DailySleepPlan;
  const todayIndex = getTodayIndex();

  // Build 7-day display from plan, padded to 7 days
  const week = Array.from({ length: 7 }, (_, i) => plan[i] ?? null);

  const nextMeet = meets?.find((m: any) => new Date(m.date) >= new Date());

  const recoveryScore = today.recoveryScore;
  const recoveryLabel = recoveryScore >= 80 ? "Peak readiness. You are primed to run a PR." : recoveryScore >= 60 ? "Moderate fatigue accumulating. Follow your wind-down to protect meet-day performance." : "High fatigue. Prioritize rest to protect your PR window.";

  return (
    <div className="min-h-screen bg-white">
      <Navbar />

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

      {/* This Week's Sleep Schedule */}
      <section className="px-6 py-10 border-b border-[#E5E5E5]">
        <div className="max-w-[1200px] mx-auto">
          <FadeUp>
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] mb-2">This Week</p>
            <h2 className="font-black text-2xl uppercase mb-6">Sleep Schedule</h2>
          </FadeUp>
          <div className="overflow-x-auto">
            <div className="flex gap-px min-w-[700px] bg-[#E5E5E5]">
              {week.map((day, i) => {
                const isToday = i === 0;
                if (!day) return (
                  <div key={i} className={`flex-1 p-4 min-w-[100px] ${isToday ? "bg-[#0A0A0A] text-white" : "bg-white"}`}>
                    <p className={`text-xs font-bold uppercase tracking-wider mb-3 ${isToday ? "text-[#E8FF00]" : "text-[#6B6B6B]"}`}>{DAYS[i]}</p>
                    <p className="text-xs text-[#6B6B6B]">Rest</p>
                  </div>
                );
                return (
                  <FadeUp key={i} delay={i * 50} className="flex-1 min-w-[100px]">
                    <div className={`p-4 h-full ${isToday ? "bg-[#0A0A0A] text-white" : "bg-white"}`}>
                      <p className={`text-xs font-bold uppercase tracking-wider mb-3 ${isToday ? "text-[#E8FF00]" : "text-[#6B6B6B]"}`}>
                        {isToday ? "Today" : DAYS[(new Date(day.date).getDay() + 6) % 7]}
                      </p>
                      <MonoClock
                        time24={(day as DailySleepPlan).recommendedBedtime}
                        className={`text-base font-black block mb-1 ${isToday ? "text-[#E8FF00]" : ""}`}
                        animate={isToday}
                      />
                      <p className={`text-xs font-mono mb-2 ${isToday ? "text-[#AAAAAA]" : "text-[#6B6B6B]"}`}>
                        Wake <MonoClock time24={(day as DailySleepPlan).recommendedWakeTime} className="inline" />
                      </p>
                      <p className={`text-xs font-bold mb-3 ${isToday ? "text-[#CCCCCC]" : "text-[#6B6B6B]"}`}>
                        {(day as DailySleepPlan).totalSleepHours}h
                      </p>
                      <div className="flex items-center gap-1.5">
                        <div className={`w-2 h-2 ${LOAD_COLORS[(day as DailySleepPlan).trainingLoadLevel]}`} />
                        <span className={`text-xs uppercase tracking-wider ${isToday ? "text-[#6B6B6B]" : "text-[#AAAAAA]"}`}>
                          {(day as DailySleepPlan).trainingLoadLevel}
                        </span>
                      </div>
                    </div>
                  </FadeUp>
                );
              })}
            </div>
          </div>
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
    </div>
  );
}
