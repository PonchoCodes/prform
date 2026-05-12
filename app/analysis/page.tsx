"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Navbar } from "@/components/Navbar";
import { FadeUp } from "@/components/FadeUp";
import { Footer } from "@/components/Footer";
import { PMCChart } from "@/components/charts/PMCChart";
import { IntensityDistributionBar } from "@/components/charts/IntensityDistributionBar";
import { PaceComplianceTable } from "@/components/charts/PaceComplianceTable";
import { SleepPaceScatterChart } from "@/components/charts/SleepPaceScatterChart";
import type { PerformanceReport } from "@/lib/performanceAnalysis";

type WindowDays = 30 | 60 | 90;

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] mb-1">{label}</p>
      <p className="font-mono font-black text-5xl leading-none">{value}</p>
      {sub && <p className="text-xs text-[#6B6B6B] mt-2">{sub}</p>}
    </div>
  );
}

function Diagnosis({ text }: { text: string }) {
  return (
    <div className="bg-[#F5F5F5] dark:bg-[#1a1a1a] px-4 py-3 mt-4">
      <p className="text-sm text-[#6B6B6B] dark:text-[#A0A0A0] leading-relaxed">{text}</p>
    </div>
  );
}

function Placeholder({ message }: { message: string }) {
  return (
    <div className="border border-[#E5E5E5] dark:border-[#333] p-8 text-center">
      <p className="text-xs font-mono text-[#6B6B6B] dark:text-[#A0A0A0]">{message}</p>
    </div>
  );
}

export default function AnalysisPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [report, setReport] = useState<PerformanceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [window, setWindow] = useState<WindowDays>(90);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated") return;
    setLoading(true);
    fetch(`/api/analysis?days=${window}`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) {
          setError(data.error ?? "Failed to load analysis.");
          setReport(null);
        } else {
          setReport(data);
          setError(null);
        }
      })
      .finally(() => setLoading(false));
  }, [status, window]);

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

      {/* Header */}
      <section className="bg-[#0A0A0A] text-white px-6 py-10 border-b border-[#222]">
        <div className="max-w-[1200px] mx-auto">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] mb-2">Performance Engine</p>
          <h1 className="font-black text-4xl md:text-5xl uppercase leading-none mb-6">Analysis</h1>
          <div className="flex gap-px mb-3">
            {([30, 60, 90] as WindowDays[]).map((d) => (
              <button
                key={d}
                onClick={() => setWindow(d)}
                className={`px-5 py-2 text-xs font-bold uppercase tracking-wider transition-colors ${
                  window === d
                    ? "bg-[#E8FF00] text-[#0A0A0A]"
                    : "border border-[#333] text-[#6B6B6B] hover:border-[#999]"
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
          {report && !loading && (
            <p className="text-[10px] font-mono text-[#6B6B6B]">
              {report.totalSynced} total runs synced · {report.activityCount} in {window}d window
            </p>
          )}
        </div>
      </section>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <p className="font-mono text-sm uppercase tracking-wider text-[#6B6B6B]">Computing…</p>
        </div>
      )}

      {error && !loading && (
        <div className="max-w-[1200px] mx-auto px-6 py-20 text-center">
          <p className="text-sm text-[#6B6B6B] mb-4">{error}</p>
          {error.includes("Strava") && (
            <a
              href="/strava"
              className="inline-block bg-[#E8FF00] text-[#0A0A0A] font-black text-xs uppercase tracking-widest px-8 py-3"
            >
              Connect Strava →
            </a>
          )}
        </div>
      )}

      {report && !loading && (
        <>
          {/* SECTION 1: PMC */}
          <section className="px-6 py-10 border-b border-[#E5E5E5] dark:border-[#333]">
            <div className="max-w-[1200px] mx-auto">
              <FadeUp>
                <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] mb-2">Banister Impulse-Response</p>
                <h2 className="font-black text-2xl uppercase mb-6">Performance Management Chart</h2>
              </FadeUp>

              {report.activityCount < 5 ? (
                <div className="border border-[#E5E5E5] p-8 text-center">
                  <p className="text-xs font-mono text-[#6B6B6B] mb-4">
                    Only {report.activityCount} run{report.activityCount !== 1 ? "s" : ""} in the last {window}d window.
                    {report.totalSynced >= 5 ? " Try a wider window:" : " Sync at least 5 runs to unlock this chart."}
                  </p>
                  {report.totalSynced >= 5 && (
                    <div className="flex justify-center gap-px">
                      {([30, 60, 90] as WindowDays[]).filter((d) => d > window).map((d) => (
                        <button
                          key={d}
                          onClick={() => setWindow(d)}
                          className="px-4 py-1.5 text-xs font-bold uppercase tracking-wider border border-[#0A0A0A] hover:bg-[#0A0A0A] hover:text-white transition-colors"
                        >
                          {d}d
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <FadeUp delay={60}>
                    <div className="bg-[#0A0A0A] p-4 mb-6">
                      <PMCChart data={report.pmc.daily} />
                    </div>
                  </FadeUp>

                  <FadeUp delay={120}>
                    <div className="grid grid-cols-3 gap-px bg-[#E5E5E5]">
                      <div className="bg-white dark:bg-[#242424] p-6">
                        <Stat label="CTL" value={report.pmc.currentCTL} sub="Chronic Training Load (fitness)" />
                      </div>
                      <div className="bg-white dark:bg-[#242424] p-6">
                        <Stat label="ATL" value={report.pmc.currentATL} sub="Acute Training Load (fatigue)" />
                      </div>
                      <div className="bg-white dark:bg-[#242424] p-6">
                        <Stat
                          label="TSB"
                          value={(report.pmc.currentTSB > 0 ? "+" : "") + report.pmc.currentTSB}
                          sub="Training Stress Balance (form)"
                        />
                      </div>
                    </div>
                    <Diagnosis text={report.pmc.interpretation} />
                  </FadeUp>
                </>
              )}
            </div>
          </section>

          {/* SECTION 2: Polarized Distribution */}
          <section className="px-6 py-10 border-b border-[#E5E5E5] dark:border-[#333]">
            <div className="max-w-[1200px] mx-auto">
              <FadeUp>
                <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] mb-2">Seiler Polarized Model</p>
                <h2 className="font-black text-2xl uppercase mb-6">Training Intensity Distribution</h2>
              </FadeUp>

              <FadeUp delay={60}>
                <div className="grid grid-cols-3 gap-px bg-[#E5E5E5] mb-6">
                  <div className="bg-white p-6">
                    <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] mb-1">Zone 1</p>
                    <p className="font-mono font-black text-5xl leading-none">{report.polarized.zone1Pct}<span className="text-2xl">%</span></p>
                    <p className="text-xs text-[#6B6B6B] mt-1 font-mono">{report.polarized.zone1Min} min</p>
                  </div>
                  <div className="bg-white p-6">
                    <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] mb-1">Zone 2</p>
                    <p className="font-mono font-black text-5xl leading-none">{report.polarized.zone2Pct}<span className="text-2xl">%</span></p>
                    <p className="text-xs text-[#6B6B6B] mt-1 font-mono">{report.polarized.zone2Min} min</p>
                  </div>
                  <div className="bg-[#0A0A0A] p-6 text-white">
                    <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] mb-1">Zone 3</p>
                    <p className="font-mono font-black text-5xl leading-none text-[#E8FF00]">{report.polarized.zone3Pct}<span className="text-2xl">%</span></p>
                    <p className="text-xs text-[#6B6B6B] mt-1 font-mono">{report.polarized.zone3Min} min</p>
                  </div>
                </div>

                <IntensityDistributionBar
                  zone1Pct={report.polarized.zone1Pct}
                  zone2Pct={report.polarized.zone2Pct}
                  zone3Pct={report.polarized.zone3Pct}
                />
                <p className="font-mono text-xs text-[#6B6B6B] mt-2">
                  OPTIMAL TARGET: 75–80% / 5–10% / 15–20%
                </p>

                <Diagnosis text={report.polarized.diagnosis} />
              </FadeUp>
            </div>
          </section>

          {/* SECTION 3: VDOT */}
          <section className="px-6 py-10 border-b border-[#E5E5E5] dark:border-[#333]">
            <div className="max-w-[1200px] mx-auto">
              <FadeUp>
                <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] mb-2">Daniels Running Formula</p>
                <h2 className="font-black text-2xl uppercase mb-6">VDOT &amp; Pace Zones</h2>
              </FadeUp>

              {!report.vdot.vdot ? (
                <Placeholder message="Sync at least one race or maximal effort to calculate VDOT." />
              ) : (
                <FadeUp delay={60}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] mb-2">Current VDOT</p>
                      <p className="font-mono font-black text-8xl leading-none mb-4">{report.vdot.vdot}</p>
                      <Diagnosis text={report.vdot.diagnosis} />

                      {report.vdot.paces && (
                        <div className="mt-6 border border-[#E5E5E5] dark:border-[#333]">
                          {[
                            ["Easy", report.vdot.paces.easyPaceMinKm],
                            ["Marathon", report.vdot.paces.marathonPaceMinKm],
                            ["Threshold", report.vdot.paces.thresholdPaceMinKm],
                            ["Interval", report.vdot.paces.intervalPaceMinKm],
                            ["Rep", report.vdot.paces.repPaceMinKm],
                          ].map(([label, pace]) => (
                            <div key={label} className="flex justify-between items-center px-4 py-2 border-b border-[#E5E5E5] dark:border-[#333] last:border-0">
                              <span className="text-xs font-bold uppercase tracking-wider text-[#6B6B6B] dark:text-[#A0A0A0]">{label}</span>
                              <span className="font-mono font-black text-lg">{pace}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] mb-4">Recent Run Analysis</p>
                      <PaceComplianceTable runs={report.vdot.recentRunAnalysis} />
                      {report.vdot.paceComplianceRate > 0 && (
                        <p className="font-mono text-xs text-[#6B6B6B] mt-3">
                          Pace compliance: <span className="text-[#0A0A0A] font-bold">{report.vdot.paceComplianceRate}%</span> on target
                        </p>
                      )}
                    </div>
                  </div>
                </FadeUp>
              )}
            </div>
          </section>

          {/* SECTION 4: Sleep-Performance Correlation */}
          <section className="px-6 py-10">
            <div className="max-w-[1200px] mx-auto">
              <FadeUp>
                <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] mb-2">PRform Core Insight</p>
                <h2 className="font-black text-2xl uppercase mb-6">Does Sleep Change Your Pace?</h2>
              </FadeUp>

              <FadeUp delay={60}>
                <SleepPaceScatterChart
                  data={report.sleepPerf.scatterData}
                  correlation={report.sleepPerf.correlation}
                />
                <Diagnosis text={report.sleepPerf.insight} />
              </FadeUp>
            </div>
          </section>

          <section className="px-6 py-4 border-t border-[#E5E5E5] dark:border-[#333]">
            <div className="max-w-[1200px] mx-auto">
              <a href="https://www.strava.com" target="_blank" rel="noopener noreferrer" className="font-mono text-[10px] text-[#6B6B6B] no-underline hover:text-[#0A0A0A]">Powered by Strava</a>
            </div>
          </section>
        </>
      )}
      <Footer />
    </div>
  );
}
