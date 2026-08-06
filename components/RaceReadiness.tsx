"use client";

import {
  formatTimeFromSeconds,
  formatTimeDifference,
  type PerformancePrediction,
} from "@/lib/performancePrediction";

interface Props {
  recoveryScore: number;
  recoveryFactorText: string;
  prediction: PerformancePrediction | null;
}

/**
 * Today's state at a glance: how recovered, and what that projects to on race
 * day. The meet's name and countdown belong to NextMeetCard — this card owns
 * the prediction and how much sleep data stands behind it.
 */
export function RaceReadiness({ recoveryScore, recoveryFactorText, prediction }: Props) {
  const barColor = recoveryScore >= 80 ? "#E8FF00" : recoveryScore >= 50 ? "#6B6B6B" : "#FF6B6B";

  return (
    <div className="bg-[#F5F5F5] dark:bg-[#0A0A0A] text-[#0A0A0A] dark:text-white border border-[#E5E5E5] dark:border-[#333333] p-5 sm:p-6">
      <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#6B6B6B] mb-5">
        Race Readiness
      </p>

      {/* Stacks below 640px: side by side, a three-digit score and "/ 100"
          overflow their half of the row on a phone. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 sm:gap-6">
        <div className="min-w-0 sm:border-r sm:border-[#E5E5E5] sm:dark:border-[#333333] sm:pr-6">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[#6B6B6B] mb-2">
            Recovery
          </p>
          <div className="flex items-baseline gap-1.5 mb-1 whitespace-nowrap">
            <span className="font-mono font-black text-3xl lg:text-4xl leading-none">
              {recoveryScore}
            </span>
            <span className="text-[#6B6B6B] text-base leading-none">/ 100</span>
          </div>
          <p className="text-xs font-mono text-[#6B6B6B] mt-2 mb-3">{recoveryFactorText}</p>
          <div className="w-full h-0.5 bg-[#E5E5E5] dark:bg-[#333333]">
            <div
              className="h-0.5 transition-all duration-700"
              style={{ width: `${recoveryScore}%`, backgroundColor: barColor }}
            />
          </div>
        </div>

        <div className="min-w-0">
          {prediction ? (
            (() => {
              const isSlower = prediction.timeDifference > 0.5;
              const isFaster = prediction.timeDifference < -0.5;
              const diffColor = isSlower ? "#FF6B6B" : isFaster ? "#0A0A0A" : "#6B6B6B";
              const diffColorDark = isSlower ? "#FF6B6B" : isFaster ? "#E8FF00" : "#6B6B6B";
              const refLabel = prediction.referenceLabel === "Season Best" ? "SB" : "PR";
              return (
                <>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[#6B6B6B] mb-2">
                    Predicted Finish
                  </p>
                  <p className="font-mono font-black text-3xl lg:text-4xl leading-none mb-1 whitespace-nowrap">
                    {formatTimeFromSeconds(prediction.predictedTime, prediction.unit)}
                  </p>
                  <p
                    className="text-xs font-mono mt-2 dark:[color:var(--diff-dark)]"
                    style={{ color: diffColor, ["--diff-dark" as any]: diffColorDark }}
                  >
                    {isSlower || isFaster
                      ? `${formatTimeDifference(prediction.timeDifference)} vs ${refLabel}`
                      : `On track for ${refLabel}`}
                  </p>
                  <p className="text-[10px] font-mono text-[#6B6B6B] mt-2">
                    Based on {prediction.confidenceNights} nights of sleep data
                  </p>
                </>
              );
            })()
          ) : (
            <>
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#6B6B6B] mb-2">
                Race Prediction
              </p>
              <p className="text-sm font-mono text-[#6B6B6B] mb-3">
                Add your event and PR to a meet
              </p>
              <a
                href="/meets"
                className="inline-flex items-center min-h-[44px] px-3 text-[11px] font-bold uppercase tracking-wider text-[#6B6B6B] border border-[#E5E5E5] dark:border-[#333] hover:border-[#0A0A0A] dark:hover:border-[#555] hover:text-[#0A0A0A] dark:hover:text-white transition-colors"
              >
                Set up →
              </a>
            </>
          )}
        </div>
      </div>

      <div className="mt-5 pt-4 border-t border-[#E5E5E5] dark:border-[#333333]">
        <a
          href="/schedule?tab=history"
          className="text-[10px] font-mono text-[#6B6B6B] hover:text-[#0A0A0A] dark:hover:text-white transition-colors"
        >
          View sleep history →
        </a>
      </div>
    </div>
  );
}
