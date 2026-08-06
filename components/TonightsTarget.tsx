"use client";

import { MonoClock } from "@/components/MonoClock";
import type { DailySleepPlan } from "@/lib/sleepAlgorithm";

/**
 * The single place tonight's bedtime, wake time and sleep target are rendered.
 * The verdict headline deliberately names none of them — one instruction each,
 * one number in one place.
 */
export function TonightsTarget({ today }: { today: DailySleepPlan }) {
  return (
    <div className="bg-[#F5F5F5] dark:bg-[#0A0A0A] border border-[#E5E5E5] dark:border-[#333] p-5">
      <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#6B6B6B] dark:text-[#A0A0A0] mb-3">
        Tonight&apos;s Target
      </p>

      <MonoClock
        time24={today.recommendedBedtime}
        accent
        animate
        className="text-4xl lg:text-5xl font-black leading-none block"
      />
      <p className="text-[#6B6B6B] dark:text-[#A0A0A0] text-[11px] uppercase tracking-wider mt-1.5">
        Fall asleep by
      </p>

      <div className="mt-4 pt-4 border-t border-[#E5E5E5] dark:border-[#222] flex items-baseline gap-6">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#6B6B6B] mb-1">Wake</p>
          <MonoClock
            time24={today.recommendedWakeTime}
            className="font-black text-lg leading-none text-[#0A0A0A] dark:text-[#F5F5F5]"
          />
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#6B6B6B] mb-1">
            Target
          </p>
          <p className="font-mono font-black text-lg leading-none text-[#0A0A0A] dark:text-[#F5F5F5]">
            {today.totalSleepHours}h
          </p>
        </div>
      </div>

      {today.circadianDelayMinutes > 30 && (
        <div className="mt-4 pt-3 border-t border-[#E5E5E5] dark:border-[#222]">
          <span className="text-[10px] font-bold uppercase tracking-widest text-[#6B6B6B] dark:text-[#E8FF00]">
            Circadian drift detected
          </span>
          <p className="text-[10px] font-mono text-[#6B6B6B] mt-0.5 leading-relaxed">
            Ramp adjusted for {Math.round((today.circadianDelayMinutes / 60) * 10) / 10}hr circadian
            delay
          </p>
        </div>
      )}
    </div>
  );
}
