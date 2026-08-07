"use client";

import { useState } from "react";
import { PrForm, EMPTY_PR, validatePrForm, type PrFormValue } from "@/components/PrForm";
import { prDistanceGuidance } from "@/lib/vdot";
import { parseTimeToSeconds } from "@/lib/performancePrediction";
import { Button } from "@/components/Button";

interface Props {
  /** Called after the PR is saved or the prompt is dismissed, to refresh data. */
  onResolved: () => void;
}

/**
 * Offers existing users the chance to supply a PR. Dismissible, and dismissal
 * sticks — the server records it so it does not reappear on the next load.
 */
export function PrPrompt({ onResolved }: Props) {
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [pr, setPr] = useState<PrFormValue>(EMPTY_PR);
  const [acknowledged, setAcknowledged] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (hidden) return null;

  const guidance = pr.distanceId ? prDistanceGuidance(pr.distanceId) : null;
  const needsAcknowledgement = !!guidance && !guidance.reliable;
  const ready = validatePrForm(pr).ok && (!needsAcknowledgement || acknowledged);

  const dismiss = async () => {
    setHidden(true);
    await fetch("/api/user/pr/dismiss", { method: "POST" }).catch(() => {});
    onResolved();
  };

  const save = async () => {
    if (!ready) {
      setShowErrors(true);
      return;
    }
    setSaving(true);
    setError(null);
    const seconds = parseTimeToSeconds(pr.time);
    const res = await fetch("/api/user/pr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prDistanceId: pr.distanceId,
        prTimeSeconds: seconds,
        prRecency: pr.recency,
      }),
    }).catch(() => null);
    setSaving(false);

    if (!res?.ok) {
      setError("Couldn't save that. Check the time and try again.");
      return;
    }
    setHidden(true);
    onResolved();
  };

  return (
    <div className="border-2 border-[#0A0A0A] dark:border-[#F5F5F5] bg-white dark:bg-[#242424] p-6">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] dark:text-[#A0A0A0] mb-2">
            Sharpen your paces
          </p>
          <h3 className="font-black text-xl uppercase">Add a race PR</h3>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss PR prompt"
          className="text-xs font-bold uppercase tracking-wider text-[#6B6B6B] dark:text-[#A0A0A0] hover:text-[#0A0A0A] dark:hover:text-[#F5F5F5] transition-colors flex-shrink-0"
        >
          Dismiss ✕
        </button>
      </div>

      <p className="text-sm text-[#6B6B6B] dark:text-[#A0A0A0] mb-4">
        Your training paces are currently inferred from logged workouts. One race result anchors
        them to a real maximal effort. Your paces will shift toward it gradually, not all at once.
      </p>

      {!open ? (
        <Button variant="primary" size="lg" onClick={() => setOpen(true)}>
          Add my PR →
        </Button>
      ) : (
        <div className="space-y-6">
          <PrForm
            value={pr}
            onChange={setPr}
            shortDistanceAcknowledged={acknowledged}
            onAcknowledgeShortDistance={setAcknowledged}
            showErrors={showErrors}
          />
          {error && (
            <p role="alert" className="text-sm font-bold border-l-4 border-[#0A0A0A] dark:border-[#F5F5F5] pl-3">
              {error}
            </p>
          )}
          <div className="flex gap-3">
            <Button variant="primary" size="lg" onClick={save} disabled={saving} className="flex-1">
              {saving ? "Saving…" : "Save PR"}
            </Button>
            <Button variant="ghost" size="lg" onClick={() => setOpen(false)} className="flex-1">
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
