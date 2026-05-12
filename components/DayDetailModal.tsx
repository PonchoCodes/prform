"use client";
import { useEffect } from "react";
import { motion } from "framer-motion";
import { AnimatePresence } from "framer-motion";
import type { DailySleepPlan } from "@/lib/sleepAlgorithm";
import { formatTime12h } from "@/lib/sleepAlgorithm";
import { mpsToMinPerMile } from "@/lib/paceUtils";

interface ActivityInfo {
  name: string;
  distance: number;
  averageSpeed: number;
  averageHeartrate?: number | null;
  workoutType?: number | null;
}

interface DayDetailModalProps {
  day: DailySleepPlan;
  activity?: ActivityInfo;
  onClose: () => void;
}

const LOAD_LABEL: Record<string, string> = {
  low: "Low Load",
  medium: "Medium Load",
  high: "High Load",
};

const LOAD_DOT: Record<string, string> = {
  low: "bg-[#E5E5E5]",
  medium: "bg-[#6B6B6B]",
  high: "bg-[#0A0A0A] dark:bg-[#F5F5F5]",
};

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function DayDetailModal({ day, activity, onClose }: DayDetailModalProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const d = new Date(day.date);
  const dayName = DAYS[d.getDay()];
  const monthDay = `${MONTHS[d.getMonth()]} ${d.getDate()}`;

  const hasConfirmed = day.sleepConfirmed;
  const recBedtime = day.recommendedBedtime;
  const actBedtime = day.actualBedtime;

  let deviationLabel = "";
  if (hasConfirmed && recBedtime && actBedtime) {
    const rec = timeToMin(recBedtime);
    const act = timeToMin(actBedtime);
    let diff = rec - act;
    if (diff > 720) diff -= 1440;
    if (diff < -720) diff += 1440;
    const abs = Math.abs(diff);
    deviationLabel = diff >= 0
      ? `${abs} min early`
      : `${abs} min late`;
  }

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-[2px] z-50 flex items-center justify-center"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.25 }}
          className="bg-white dark:bg-[#242424] border border-[#E5E5E5] dark:border-[#333] max-w-[480px] w-full mx-4"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5E5E5] dark:border-[#333]">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] dark:text-[#A0A0A0]">{dayName} / {monthDay}</p>
              <h3 className="font-black text-xl uppercase">{day.nextMeetName ? "Meet Week" : "Training Day"}</h3>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center border border-[#E5E5E5] dark:border-[#333] text-[#6B6B6B] dark:text-[#A0A0A0] hover:border-[#0A0A0A] dark:hover:border-[#F5F5F5] transition-colors font-bold"
            >
              ×
            </button>
          </div>

          {/* Sleep Section */}
          <div className="px-6 py-4 border-b border-[#E5E5E5] dark:border-[#333]">
            <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#6B6B6B] dark:text-[#A0A0A0] mb-3">Sleep Target</p>
            <div className="grid grid-cols-3 gap-4 mb-3">
              <div>
                <p className="text-[10px] text-[#6B6B6B] dark:text-[#A0A0A0] uppercase tracking-wider mb-1">Bedtime</p>
                <p className="font-mono font-black text-xl">{formatTime12h(day.recommendedBedtime)}</p>
              </div>
              <div>
                <p className="text-[10px] text-[#6B6B6B] dark:text-[#A0A0A0] uppercase tracking-wider mb-1">Wake</p>
                <p className="font-mono font-black text-xl">{formatTime12h(day.recommendedWakeTime)}</p>
              </div>
              <div>
                <p className="text-[10px] text-[#6B6B6B] dark:text-[#A0A0A0] uppercase tracking-wider mb-1">Hours</p>
                <p className="font-mono font-black text-xl">{day.totalSleepHours}h</p>
              </div>
            </div>

            {hasConfirmed && actBedtime && (
              <div className="bg-[#F5F5F5] dark:bg-[#1a1a1a] px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-[10px] text-[#6B6B6B] dark:text-[#A0A0A0] uppercase tracking-wider mb-0.5">Actual bedtime</p>
                  <p className="font-mono font-bold text-sm">{formatTime12h(actBedtime)}</p>
                </div>
                <div className="text-right">
                  <span className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                    actBedtime === recBedtime
                      ? "bg-[#0A0A0A] dark:bg-[#F5F5F5] text-white dark:text-[#0A0A0A]"
                      : "border border-[#0A0A0A] dark:border-[#F5F5F5]"
                  }`}>
                    {actBedtime === recBedtime ? "HIT" : "MISSED"}
                  </span>
                  {deviationLabel && (
                    <p className="text-[10px] font-mono text-[#6B6B6B] dark:text-[#A0A0A0] mt-1">{deviationLabel}</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Workout Section */}
          <div className="px-6 py-4 border-b border-[#E5E5E5] dark:border-[#333]">
            <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#6B6B6B] dark:text-[#A0A0A0] mb-3">Workout</p>
            {activity ? (
              <div>
                <p className="font-bold text-sm mb-1 truncate">{activity.name}</p>
                <div className="flex gap-4 text-xs font-mono text-[#6B6B6B] dark:text-[#A0A0A0]">
                  <span>{(activity.distance / 1000).toFixed(2)} km</span>
                  <span>{mpsToMinPerMile(activity.averageSpeed)}</span>
                  {activity.averageHeartrate && <span>{Math.round(activity.averageHeartrate)} bpm</span>}
                </div>
              </div>
            ) : (
              <p className="text-sm text-[#6B6B6B] dark:text-[#A0A0A0]">
                {day.trainingLoadLevel === "low" ? "Rest day" : "Workout not synced"}
              </p>
            )}
          </div>

          {/* Training Load */}
          <div className="px-6 py-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#6B6B6B] dark:text-[#A0A0A0] mb-3">Training Load</p>
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 ${LOAD_DOT[day.trainingLoadLevel]}`} />
              <span className="text-sm font-bold uppercase tracking-wider">{LOAD_LABEL[day.trainingLoadLevel]}</span>
            </div>
            {day.fatigueSleepBoost && (
              <p className="text-[10px] font-mono text-[#6B6B6B] dark:text-[#A0A0A0] mt-2">
                +{day.fatigueSleepBoostMinutes} min sleep added for high training stress.
              </p>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

function timeToMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}
