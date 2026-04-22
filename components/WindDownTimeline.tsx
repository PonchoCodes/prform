"use client";
import { useEffect, useState } from "react";
import { formatTime12h } from "@/lib/sleepAlgorithm";

interface WindDownPhases {
  phase1: string;
  phase2: string;
  phase3: string;
  phase4: string;
}

interface Phase {
  key: keyof WindDownPhases;
  label: string;
  description: string;
  extra?: React.ReactNode;
}

const phases: Phase[] = [
  {
    key: "phase1",
    label: "Dim Lights",
    description: "Dim overhead lights. Move to lamps only.",
  },
  {
    key: "phase2",
    label: "Night Mode",
    description: "Enable Night Shift / Night Mode on all devices.",
    extra: (
      <div className="flex gap-2 mt-2">
        <a
          href="App-prefs:root=DISPLAY"
          className="text-xs font-bold uppercase tracking-wider px-3 py-1 border border-[#0A0A0A] hover:bg-[#0A0A0A] hover:text-white transition-colors"
        >
          iOS Settings →
        </a>
        <a
          href="intent://settings"
          className="text-xs font-bold uppercase tracking-wider px-3 py-1 border border-[#0A0A0A] hover:bg-[#0A0A0A] hover:text-white transition-colors"
        >
          Android Settings →
        </a>
      </div>
    ),
  },
  {
    key: "phase3",
    label: "No Screens",
    description: "Put your phone across the room. No more screens.",
  },
  {
    key: "phase4",
    label: "Lights Off",
    description: "Lights off or near-dark. Lie down.",
  },
];

function getStatus(phaseTime24: string, nowMinutes: number): "upcoming" | "now" | "done" {
  const [h, m] = phaseTime24.split(":").map(Number);
  const phaseMinutes = h * 60 + m;

  const window = 30;
  if (nowMinutes >= phaseMinutes && nowMinutes < phaseMinutes + window) return "now";
  if (nowMinutes >= phaseMinutes + window) return "done";
  return "upcoming";
}

function currentMinutes(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

interface WindDownTimelineProps {
  windDown: WindDownPhases;
}

export function WindDownTimeline({ windDown }: WindDownTimelineProps) {
  const [now, setNow] = useState(currentMinutes());

  useEffect(() => {
    const interval = setInterval(() => setNow(currentMinutes()), 60000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-px bg-[#E5E5E5]">
        {phases.map((phase) => {
          const status = getStatus(windDown[phase.key], now);
          return (
            <div
              key={phase.key}
              className={`p-5 ${
                status === "now"
                  ? "bg-[#0A0A0A] text-white"
                  : status === "done"
                  ? "bg-[#F5F5F5]"
                  : "bg-white"
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <span
                  className={`text-xs font-bold uppercase tracking-widest ${
                    status === "now"
                      ? "text-[#E8FF00]"
                      : status === "done"
                      ? "text-[#6B6B6B]"
                      : "text-[#6B6B6B]"
                  }`}
                >
                  {status === "now" ? "● NOW" : status === "done" ? "✓ DONE" : "UPCOMING"}
                </span>
                <span
                  className={`font-mono text-sm font-bold ${
                    status === "now" ? "text-[#E8FF00] accent-pulse" : ""
                  }`}
                >
                  {formatTime12h(windDown[phase.key])}
                </span>
              </div>
              <p className="text-xs font-bold uppercase tracking-wider mb-1">{phase.label}</p>
              <p className={`text-sm leading-relaxed ${status === "now" ? "text-[#CCCCCC]" : "text-[#6B6B6B]"}`}>
                {phase.description}
              </p>
              {phase.extra && status !== "done" && (
                <div className={status === "now" ? "[&_a]:border-white [&_a]:text-white [&_a:hover]:bg-white [&_a:hover]:text-[#0A0A0A]" : ""}>
                  {phase.extra}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
