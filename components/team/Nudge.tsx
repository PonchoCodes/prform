"use client";
import { useCallback, useState } from "react";
import { Button } from "@/components/Button";

// Nudge: one tap per flagged athlete, or all of them at once.
//
// The owner sees an outcome per athlete and a fixed preview of what was
// sent; the body itself carries the athlete's own target and never comes
// back to this page. "Already today" is the rate limit showing rather than
// an error: the second tap did the right thing by doing nothing.

type Outcome = "sent" | "dry_run" | "already_today" | "unreachable" | "blocked" | "failed";

interface NudgeResult {
  membershipId: string;
  outcome: Outcome;
}

export interface NudgeState {
  outcomes: Record<string, Outcome>;
  busy: string | "all" | null;
  preview: string | null;
  nudge: (membershipId: string) => Promise<void>;
  nudgeAll: () => Promise<void>;
}

export function useNudges(teamId: string): NudgeState {
  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>({});
  const [busy, setBusy] = useState<string | "all" | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const post = useCallback(
    async (payload: { membershipId: string } | { all: true }) => {
      const res = await fetch(`/api/teams/${teamId}/nudge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) return;
      const data = await res.json();
      setPreview(data.preview ?? null);
      setOutcomes((prev) => {
        const next = { ...prev };
        for (const r of (data.results ?? []) as NudgeResult[]) next[r.membershipId] = r.outcome;
        return next;
      });
    },
    [teamId],
  );

  const nudge = useCallback(
    async (membershipId: string) => {
      setBusy(membershipId);
      await post({ membershipId });
      setBusy(null);
    },
    [post],
  );

  const nudgeAll = useCallback(async () => {
    setBusy("all");
    await post({ all: true });
    setBusy(null);
  }, [post]);

  return { outcomes, busy, preview, nudge, nudgeAll };
}

const OUTCOME_LABEL: Record<Outcome, string> = {
  sent: "Nudged",
  dry_run: "Nudged",
  already_today: "Already today",
  unreachable: "No way to reach them",
  blocked: "Not now",
  failed: "Didn't send",
};

export function NudgeButton({ nudges, membershipId }: { nudges: NudgeState; membershipId: string }) {
  const outcome = nudges.outcomes[membershipId];
  const working = nudges.busy === membershipId || nudges.busy === "all";

  if (outcome) {
    return (
      <span className="text-[10px] font-mono uppercase tracking-wider text-[#6B6B6B] dark:text-[#A0A0A0] shrink-0 mt-1">
        {OUTCOME_LABEL[outcome]}
      </span>
    );
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className="shrink-0"
      onClick={() => nudges.nudge(membershipId)}
      disabled={working}
    >
      {working ? "…" : "Nudge"}
    </Button>
  );
}

export function NudgeAllButton({ nudges, count }: { nudges: NudgeState; count: number }) {
  const working = nudges.busy !== null;
  return (
    <Button variant="ghost" size="sm" onClick={nudges.nudgeAll} disabled={working}>
      {nudges.busy === "all" ? "…" : `Nudge all ${count}`}
    </Button>
  );
}
