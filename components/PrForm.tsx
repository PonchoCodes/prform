"use client";

import { useMemo } from "react";
import {
  PR_DISTANCES,
  PR_RECENCY_OPTIONS,
  prDistanceById,
  prDistanceGuidance,
  prTimePlaceholder,
  validatePrTime,
  vdotFromPr,
} from "@/lib/vdot";
import { parseTimeToSeconds } from "@/lib/performancePrediction";

export interface PrFormValue {
  distanceId: string;
  time: string;
  recency: string;
}

export const EMPTY_PR: PrFormValue = { distanceId: "", time: "", recency: "" };

interface Props {
  value: PrFormValue;
  onChange: (next: PrFormValue) => void;
  /** Set when the user has acknowledged the short-distance warning. */
  shortDistanceAcknowledged: boolean;
  onAcknowledgeShortDistance: (acknowledged: boolean) => void;
  /** Show validation errors only after a submit attempt. */
  showErrors?: boolean;
}

/** Validation state for a PR form value, shared by the form and its callers. */
export function validatePrForm(value: PrFormValue): { ok: boolean; error: string | null } {
  if (!value.distanceId) return { ok: false, error: "Pick a distance." };
  const seconds = parseTimeToSeconds(value.time);
  if (seconds === null) {
    return { ok: false, error: "Enter a time, e.g. " + prTimePlaceholder(value.distanceId) + "." };
  }
  const result = validatePrTime(value.distanceId, seconds);
  if (!result.ok) return { ok: false, error: result.error ?? "That time doesn't look right." };
  if (!value.recency) return { ok: false, error: "Tell us roughly when you ran it." };
  return { ok: true, error: null };
}

/** True when the value is blank enough to treat as "skipped" rather than invalid. */
export function isPrFormEmpty(value: PrFormValue): boolean {
  return !value.distanceId && !value.time.trim() && !value.recency;
}

const INPUT_CLASS =
  "w-full border border-[#E5E5E5] dark:border-[#444] dark:bg-[#2a2a2a] dark:text-[#F5F5F5] px-4 py-3 text-sm font-mono focus:outline-none focus:border-[#0A0A0A] dark:focus:border-[#F5F5F5]";
const LABEL_CLASS = "block text-xs font-bold uppercase tracking-wider mb-2";

export function PrForm({
  value,
  onChange,
  shortDistanceAcknowledged,
  onAcknowledgeShortDistance,
  showErrors = false,
}: Props) {
  const guidance = value.distanceId ? prDistanceGuidance(value.distanceId) : null;
  const validation = useMemo(() => validatePrForm(value), [value]);

  const seconds = parseTimeToSeconds(value.time);
  const previewVdot =
    value.distanceId && seconds !== null ? vdotFromPr(value.distanceId, seconds) : null;

  const set = (patch: Partial<PrFormValue>) => onChange({ ...value, ...patch });

  return (
    <div className="space-y-6">
      <div>
        <label htmlFor="pr-distance" className={LABEL_CLASS}>
          Distance
        </label>
        <select
          id="pr-distance"
          value={value.distanceId}
          onChange={(e) => {
            set({ distanceId: e.target.value });
            onAcknowledgeShortDistance(false);
          }}
          className={`${INPUT_CLASS} bg-white`}
        >
          <option value="">Select distance…</option>
          {PR_DISTANCES.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
            </option>
          ))}
        </select>
      </div>

      {guidance && !guidance.reliable && (
        <div className="border-2 border-[#0A0A0A] dark:border-[#F5F5F5] p-4">
          <p className="text-xs font-bold uppercase tracking-[0.3em] mb-2">Heads up</p>
          <p className="text-sm text-[#0A0A0A] dark:text-[#F5F5F5] mb-3">{guidance.warning}</p>
          <div className="flex flex-wrap gap-2 mb-3">
            {guidance.preferredAlternatives.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => {
                  set({ distanceId: d.id, time: "" });
                  onAcknowledgeShortDistance(false);
                }}
                className="px-3 py-2 text-xs font-bold uppercase tracking-wider border border-[#E5E5E5] dark:border-[#444] hover:border-[#0A0A0A] dark:hover:border-[#F5F5F5] transition-colors"
              >
                Use {d.label} instead
              </button>
            ))}
          </div>
          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={shortDistanceAcknowledged}
              onChange={(e) => onAcknowledgeShortDistance(e.target.checked)}
              className="mt-0.5"
            />
            <span className="text-[#6B6B6B] dark:text-[#A0A0A0]">
              I understand — use my {prDistanceById(value.distanceId)?.label} PR anyway.
            </span>
          </label>
        </div>
      )}

      <div>
        <label htmlFor="pr-time" className={LABEL_CLASS}>
          Time
        </label>
        <input
          id="pr-time"
          type="text"
          inputMode="numeric"
          value={value.time}
          onChange={(e) => set({ time: e.target.value })}
          placeholder={value.distanceId ? prTimePlaceholder(value.distanceId) : "MM:SS"}
          className={INPUT_CLASS}
          aria-describedby="pr-time-help"
        />
        <p
          id="pr-time-help"
          className="text-xs font-mono text-[#6B6B6B] dark:text-[#A0A0A0] mt-2"
        >
          {previewVdot
            ? `VDOT ${previewVdot} — we'll build your full pace table from this.`
            : value.distanceId
              ? `Format: ${prTimePlaceholder(value.distanceId)}`
              : "Pick a distance first."}
        </p>
      </div>

      <div>
        <label htmlFor="pr-recency" className={LABEL_CLASS}>
          When did you run it?
        </label>
        <select
          id="pr-recency"
          value={value.recency}
          onChange={(e) => set({ recency: e.target.value })}
          className={`${INPUT_CLASS} bg-white`}
        >
          <option value="">Select…</option>
          {PR_RECENCY_OPTIONS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        <p className="text-xs font-mono text-[#6B6B6B] dark:text-[#A0A0A0] mt-2">
          An older PR still gets you started — we just lean on your logged training sooner.
        </p>
      </div>

      {showErrors && validation.error && (
        <p role="alert" className="text-sm font-bold text-[#0A0A0A] dark:text-[#F5F5F5] border-l-4 border-[#0A0A0A] dark:border-[#F5F5F5] pl-3">
          {validation.error}
        </p>
      )}
    </div>
  );
}
