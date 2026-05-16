"use client";
import { FadeUp } from "@/components/FadeUp";
import type { CircadianPlan } from "@/lib/sleepAlgorithm";
import { formatTime12h } from "@/lib/sleepAlgorithm";

export function CircadianProtocolSection({ circadian }: { circadian: CircadianPlan }) {
  return (
    <section className="border-b border-[#E5E5E5] dark:border-[#333] px-6 py-10">
      <div className="max-w-[1200px] mx-auto">
        <FadeUp>
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] dark:text-[#A0A0A0] mb-2">Phase Response Curve</p>
          <h2 className="font-black text-2xl uppercase mb-1">Circadian Protocol</h2>
          <p className="text-xs text-[#6B6B6B] dark:text-[#A0A0A0] font-mono mb-8 max-w-xl">{circadian.mechanismNote}</p>
        </FadeUp>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-[#E5E5E5] dark:bg-[#333]">
          <FadeUp className="bg-white dark:bg-[#242424] p-6">
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] dark:text-[#A0A0A0] mb-3">CBTmin Anchor</p>
            <p className="font-mono font-black text-5xl leading-none mb-2">{formatTime12h(circadian.cbtMin)}</p>
            <p className="text-xs text-[#6B6B6B] dark:text-[#A0A0A0] uppercase tracking-wider mb-4">Core body temp minimum</p>
            <div className="space-y-1 text-xs font-mono text-[#6B6B6B] dark:text-[#A0A0A0]">
              <p><span className="text-[#E8FF00] bg-[#0A0A0A] px-1">ADVANCE ZONE</span> after {formatTime12h(circadian.advanceWindowStart)}</p>
              <p><span className="text-red-400 bg-[#0A0A0A] px-1">DELAY ZONE</span> before {formatTime12h(circadian.delayZoneEnd)}</p>
            </div>
          </FadeUp>

          <FadeUp delay={60} className="bg-[#F5F5F5] dark:bg-[#0A0A0A] p-6">
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] mb-3">Light Prescription</p>
            <div className="flex items-end gap-2 mb-1">
              <p className="font-mono font-black text-4xl leading-none text-[#0A0A0A] dark:text-[#E8FF00]">{formatTime12h(circadian.lightExposure.start)}</p>
              <p className="text-[#6B6B6B] text-sm mb-1 font-mono">&rarr; {formatTime12h(circadian.lightExposure.end)}</p>
            </div>
            <p className="text-xs text-[#6B6B6B] uppercase tracking-wider mb-4">
              {circadian.lightExposure.durationMin} min &middot; {circadian.lightExposure.type === "outdoor" ? "Outdoor sunlight" : "10,000 lux lamp"}
            </p>
            <p className="text-xs text-[#6B6B6B] dark:text-[#AAAAAA] font-mono leading-relaxed">{circadian.lightExposure.instruction}</p>
          </FadeUp>

          <FadeUp delay={120} className="bg-white dark:bg-[#242424] p-6">
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] dark:text-[#A0A0A0] mb-3">Shift Progress</p>
            <div className="flex items-end gap-2 mb-4">
              <p className="font-mono font-black text-5xl leading-none">{circadian.cumulativeShiftMin}</p>
              <p className="text-[#6B6B6B] dark:text-[#A0A0A0] text-sm mb-1">min advanced</p>
            </div>
            <div className="w-full h-1.5 bg-[#E5E5E5] dark:bg-[#444] mb-4">
              <div
                className="h-1.5 bg-[#E8FF00] transition-all duration-700"
                style={{ width: `${Math.min(100, (circadian.cumulativeShiftMin / Math.max(circadian.cumulativeShiftMin, 90)) * 100)}%` }}
              />
            </div>
            <div className="space-y-1 text-xs font-mono text-[#6B6B6B] dark:text-[#A0A0A0]">
              <p>+{circadian.dailyShiftMin} min today &rarr; target {formatTime12h(circadian.targetWakeTime)} wake</p>
              <p className="text-[#0A0A0A] dark:text-[#F5F5F5] font-bold uppercase tracking-wider mt-3">
                Dim lights after {formatTime12h(circadian.lightAvoidStart)}
              </p>
            </div>
          </FadeUp>
        </div>
      </div>
    </section>
  );
}
