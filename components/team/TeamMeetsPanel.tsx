"use client";
import { useCallback, useEffect, useState } from "react";
import { FadeUp } from "@/components/FadeUp";
import { Button } from "@/components/Button";
import { INPUT, REMOVE_BUTTON, READINESS_DOT, formatDate, type ReadinessColor } from "@/components/team/ui";

// The next meet: the team calendar, and each athlete against the ramp.
//
// The calendar half is free. A meet on it fires every athlete's own ramp, and
// the athlete's plan is not behind the team plan. The readiness half is per
// athlete and sits behind the plan like the exception list does. Rows arrive
// sorted worst first; athletes with nothing logged are their own group
// underneath, because "no read" is a different problem from "behind".

interface TeamMeetRow {
  id: string;
  name: string;
  date: string;
  distances: string;
}

export interface MeetAthleteRow {
  name: string;
  readiness: ReadinessColor;
  ramp: "on_ramp" | "behind" | "no_data";
  line: string;
}

interface MeetReadinessPayload {
  meet: { id: string; name: string; date: string; distances: string } | null;
  daysOut: number;
  rampOpen: boolean;
  rampOpensIn: number;
  athletes: MeetAthleteRow[];
  noData: MeetAthleteRow[];
  summary: string;
}

const RAMP_LABEL: Record<MeetAthleteRow["ramp"], string> = {
  on_ramp: "On ramp",
  behind: "Behind",
  no_data: "No data",
};

export function TeamMeetsPanel({ teamId, needsPlan }: { teamId: string; needsPlan: boolean }) {
  const [meets, setMeets] = useState<TeamMeetRow[]>([]);
  const [readiness, setReadiness] = useState<MeetReadinessPayload | null>(null);
  const [readinessLocked, setReadinessLocked] = useState(false);
  const [form, setForm] = useState({ name: "", date: "", distances: "" });
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    const [meetsRes, readyRes] = await Promise.all([
      fetch(`/api/teams/${teamId}/meets`),
      fetch(`/api/teams/${teamId}/meet-readiness`),
    ]);
    if (meetsRes.ok) setMeets((await meetsRes.json()).meets ?? []);
    if (readyRes.ok) {
      setReadiness(await readyRes.json());
      setReadinessLocked(false);
    } else if (readyRes.status === 402) {
      setReadinessLocked(true);
    }
  }, [teamId]);

  useEffect(() => {
    load();
  }, [load]);

  const addMeet = async () => {
    if (form.name.trim().length < 2 || !form.date) return;
    setSaving(true);
    const res = await fetch(`/api/teams/${teamId}/meets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      setForm({ name: "", date: "", distances: "" });
      setShowForm(false);
      await load();
    }
    setSaving(false);
  };

  const removeMeet = async (id: string) => {
    await fetch(`/api/teams/${teamId}/meets`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await load();
  };

  const next = readiness?.meet ?? null;
  const locked = needsPlan || readinessLocked;
  const hasRows = Boolean(readiness && (readiness.athletes.length > 0 || readiness.noData.length > 0));

  return (
    <div className="p-6 border-b border-[#E5E5E5] dark:border-[#333]">
      <div className="flex items-center justify-between gap-4 mb-4">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B]">Next Meet</p>
        <Button variant="ghost" size="sm" onClick={() => setShowForm(!showForm)}>
          + Add Meet
        </Button>
      </div>

      {showForm && (
        <FadeUp>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-6">
            <input
              type="text"
              placeholder="Meet name"
              aria-label="Meet name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className={INPUT}
            />
            <input
              type="date"
              aria-label="Meet date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              className={INPUT}
            />
            <input
              type="text"
              placeholder="Events (e.g. 5K, 4x400)"
              aria-label="Events"
              value={form.distances}
              onChange={(e) => setForm({ ...form, distances: e.target.value })}
              className={INPUT}
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={addMeet}
              disabled={form.name.trim().length < 2 || !form.date || saving}
            >
              {saving ? "Saving…" : "Add"}
            </Button>
          </div>
        </FadeUp>
      )}

      {meets.length === 0 ? (
        !showForm && (
          <div className="text-center py-10 border border-dashed border-[#E5E5E5] dark:border-[#333]">
            <p className="text-[#6B6B6B] dark:text-[#A0A0A0] text-sm mb-4">No meets on the calendar.</p>
            <Button variant="secondary" size="sm" onClick={() => setShowForm(true)}>
              Add Your First Meet
            </Button>
          </div>
        )
      ) : (
        <>
          {next && readiness && (
            <div className="mb-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                <p className="font-black text-xl uppercase">
                  {next.name}
                  {next.distances && (
                    <span className="ml-3 text-xs font-mono font-normal normal-case text-[#6B6B6B] dark:text-[#A0A0A0]">
                      {next.distances}
                    </span>
                  )}
                </p>
                <p className="font-mono text-sm tabular-nums">
                  {formatDate(next.date)} ·{" "}
                  <span className="font-bold">
                    {readiness.daysOut === 0
                      ? "today"
                      : `${readiness.daysOut} day${readiness.daysOut === 1 ? "" : "s"} out`}
                  </span>
                </p>
              </div>
              {!locked && (
                <p className="text-xs font-mono text-[#6B6B6B] dark:text-[#A0A0A0] mt-1">{readiness.summary}</p>
              )}
            </div>
          )}

          {locked ? (
            <p className="text-sm text-[#6B6B6B] dark:text-[#A0A0A0] mb-6">
              Readiness for each athlete before the meet comes with the team plan.{" "}
              <a
                href={`/team/billing?team=${teamId}`}
                className="font-bold text-[#0A0A0A] dark:text-[#F5F5F5] border-b border-[#E8FF00]"
              >
                See what it costs
              </a>
              .
            </p>
          ) : next && hasRows && readiness ? (
            <div className="mb-6">
              <div className="space-y-px bg-[#E5E5E5] dark:bg-[#333]">
                {readiness.athletes.map((a) => (
                  <MeetAthleteLine key={a.name} row={a} />
                ))}
              </div>
              {readiness.noData.length > 0 && (
                <>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[#6B6B6B] dark:text-[#A0A0A0] mt-4 mb-1">
                    Nothing logged
                  </p>
                  <div className="space-y-px bg-[#E5E5E5] dark:bg-[#333]">
                    {readiness.noData.map((a) => (
                      <MeetAthleteLine key={a.name} row={a} />
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : null}

          <div className="space-y-px bg-[#E5E5E5] dark:bg-[#333]">
            {meets.map((m) => (
              <div key={m.id} className="bg-white dark:bg-[#242424] p-3 flex items-center justify-between gap-4">
                <div className="flex items-center gap-4 min-w-0">
                  <p className="font-mono text-sm text-[#6B6B6B] dark:text-[#A0A0A0] w-28 shrink-0">{formatDate(m.date)}</p>
                  <span className="text-xs font-bold uppercase tracking-wider truncate">{m.name}</span>
                  {m.distances && (
                    <span className="text-xs font-mono text-[#6B6B6B] dark:text-[#A0A0A0] truncate">{m.distances}</span>
                  )}
                </div>
                <button onClick={() => removeMeet(m.id)} className={REMOVE_BUTTON}>
                  Remove
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function MeetAthleteLine({ row }: { row: MeetAthleteRow }) {
  return (
    <div className="bg-white dark:bg-[#242424] p-4 flex items-start gap-4">
      <span
        aria-label={row.readiness === "red" ? "Red" : row.readiness === "amber" ? "Amber" : "Green"}
        className={`mt-1 inline-block w-3 h-3 flex-shrink-0 ${READINESS_DOT[row.readiness]}`}
      />
      <div className="min-w-0">
        <p className="font-bold text-sm uppercase tracking-wider">
          {row.name}
          <span
            className={`ml-3 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 border ${
              row.ramp === "on_ramp"
                ? "border-[#0A0A0A] dark:border-[#F5F5F5]"
                : row.ramp === "behind"
                  ? "bg-[#E8FF00] border-[#E8FF00] text-[#0A0A0A]"
                  : "border-[#E5E5E5] dark:border-[#333] text-[#6B6B6B] dark:text-[#A0A0A0]"
            }`}
          >
            {RAMP_LABEL[row.ramp]}
          </span>
        </p>
        <p className="text-sm mt-1">{row.line}</p>
      </div>
    </div>
  );
}
