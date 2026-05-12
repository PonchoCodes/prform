"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Navbar } from "@/components/Navbar";
import { FadeUp } from "@/components/FadeUp";
import { Footer } from "@/components/Footer";
import { formatTime12h } from "@/lib/sleepAlgorithm";

function parseTimeMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function minutesToTime(min: number): string {
  const total = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function formatDateLabel(dateStr: string): string {
  return new Date(dateStr + "T12:00:00Z").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

interface SleepLog {
  id: string;
  date: string;
  recommendedBedtime: string;
  hitTarget: boolean | null;
  actualBedtime: string | null;
  actualWakeTime: string | null;
  actualSleepHours: number | null;
}

interface RowState {
  mode: "view" | "log" | "edit";
  hitTarget: boolean | null;
  actualBedtime: string;
  actualWakeTime: string;
  saving: boolean;
}

function DeviationBadge({ log }: { log: SleepLog }) {
  if (log.hitTarget === true) {
    return <span className="text-xs font-mono text-[#6B6B6B]">On time</span>;
  }
  if (log.actualBedtime && log.recommendedBedtime) {
    const actual = parseTimeMin(log.actualBedtime);
    const rec = parseTimeMin(log.recommendedBedtime);
    let dev = actual - rec;
    if (dev > 720) dev -= 1440;
    if (dev < -720) dev += 1440;
    const abs = Math.abs(dev);
    const sign = dev > 0 ? "+" : "-";
    if (abs < 1) return <span className="text-xs font-mono text-[#6B6B6B]">On time</span>;
    return (
      <span className={`text-xs font-mono font-bold ${dev > 0 ? "text-[#0A0A0A]" : "text-[#6B6B6B]"}`}>
        {sign}{abs} min
      </span>
    );
  }
  return <span className="text-xs font-mono text-[#6B6B6B]">—</span>;
}

function StatusBadge({ log }: { log: SleepLog | null }) {
  if (!log || log.hitTarget === null || log.hitTarget === undefined) {
    return (
      <span className="text-[10px] font-bold uppercase tracking-wider bg-[#F5F5F5] text-[#6B6B6B] px-2 py-0.5">
        Unlogged
      </span>
    );
  }
  if (log.hitTarget === true) {
    return (
      <span className="text-[10px] font-bold uppercase tracking-wider bg-[#0A0A0A] text-white px-2 py-0.5">
        Hit
      </span>
    );
  }
  return (
    <span className="text-[10px] font-bold uppercase tracking-wider border border-[#0A0A0A] text-[#0A0A0A] px-2 py-0.5">
      Missed
    </span>
  );
}

export default function SleepHistoryPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [logs, setLogs] = useState<SleepLog[]>([]);
  const [streak, setStreak] = useState<any>(null);
  const [userBedtime, setUserBedtime] = useState("22:30");
  const [userWake, setUserWake] = useState("06:00");
  const [loading, setLoading] = useState(true);
  const [rowStates, setRowStates] = useState<Record<string, RowState>>({});

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated") return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(today);
    start.setDate(today.getDate() - 29);

    Promise.all([
      fetch(`/api/sleep-log?startDate=${start.toISOString().slice(0, 10)}&endDate=${today.toISOString().slice(0, 10)}`).then((r) => r.json()),
      fetch("/api/sleep-log/streak").then((r) => r.json()),
      fetch("/api/user/profile").then((r) => r.json()),
    ]).then(([logsData, streakData, profile]) => {
      setLogs(logsData);
      setStreak(streakData);
      setUserBedtime(profile.currentBedTime ?? "22:30");
      setUserWake(profile.currentWakeTime ?? "06:00");
      setLoading(false);
    });
  }, [status]);

  // Build last 30 days
  const days: string[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 0; i < 30; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }

  const logMap = new Map<string, SleepLog>();
  for (const l of logs) {
    logMap.set(new Date(l.date).toISOString().slice(0, 10), l);
  }

  function getRowState(dateStr: string): RowState {
    return rowStates[dateStr] ?? { mode: "view", hitTarget: null, actualBedtime: minutesToTime(parseTimeMin(userBedtime) + 30), actualWakeTime: userWake, saving: false };
  }

  function setRowState(dateStr: string, patch: Partial<RowState>) {
    setRowStates((prev) => ({ ...prev, [dateStr]: { ...getRowState(dateStr), ...patch } }));
  }

  async function submitLog(dateStr: string, hitTarget: boolean, log: SleepLog | null) {
    const row = getRowState(dateStr);
    setRowState(dateStr, { saving: true });
    const recBedtime = log?.recommendedBedtime ?? userBedtime;

    if (log) {
      // Edit existing
      await fetch(`/api/sleep-log/${log.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hitTarget,
          actualBedtime: hitTarget ? undefined : row.actualBedtime,
          actualWakeTime: row.actualWakeTime || undefined,
        }),
      });
    } else {
      // Create new
      await fetch("/api/sleep-log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: dateStr,
          hitTarget,
          actualBedtime: hitTarget ? undefined : row.actualBedtime,
          actualWakeTime: row.actualWakeTime || undefined,
          recommendedBedtime: recBedtime,
        }),
      });
    }

    // Refresh logs
    const start = new Date(today);
    start.setDate(today.getDate() - 29);
    const [newLogs, newStreak] = await Promise.all([
      fetch(`/api/sleep-log?startDate=${start.toISOString().slice(0, 10)}&endDate=${today.toISOString().slice(0, 10)}`).then((r) => r.json()),
      fetch("/api/sleep-log/streak").then((r) => r.json()),
    ]);
    setLogs(newLogs);
    setStreak(newStreak);
    setRowState(dateStr, { mode: "view", saving: false });
  }

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <p className="font-mono text-sm uppercase tracking-wider text-[#6B6B6B]">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      {/* Header */}
      <section className="bg-[#0A0A0A] text-white px-6 py-10 border-b border-[#222]">
        <div className="max-w-[1200px] mx-auto">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] mb-2">PRform Core</p>
          <h1 className="font-black text-4xl md:text-5xl uppercase leading-none mb-6">Sleep History</h1>

          {streak && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-[#222]">
              {[
                [streak.currentStreak, "Night Streak"],
                [`${streak.hitRateLast7}%`, "Last 7 Days"],
                [`${streak.hitRateLast30}%`, "Last 30 Days"],
                [`${streak.avgDeviationMinutes > 0 ? "+" : ""}${streak.avgDeviationMinutes} min`, "Avg Deviation"],
              ].map(([val, label]) => (
                <div key={label as string} className="bg-[#0A0A0A] p-4">
                  <p className="font-mono font-black text-4xl leading-none text-[#E8FF00]">{val}</p>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#6B6B6B] mt-1">{label}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* History table */}
      <div className="max-w-[1200px] mx-auto px-6 py-10">
        <FadeUp>
          <div className="border border-[#E5E5E5]">
            {/* Header row */}
            <div className="grid grid-cols-5 gap-px bg-[#E5E5E5] border-b border-[#E5E5E5]">
              {["Date", "Target", "Actual", "Deviation", "Status"].map((h) => (
                <div key={h} className="bg-white px-4 py-2">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#6B6B6B]">{h}</p>
                </div>
              ))}
            </div>

            {days.map((dateStr) => {
              const log = logMap.get(dateStr) ?? null;
              const row = getRowState(dateStr);
              const isExpanded = row.mode !== "view";
              const isToday = dateStr === today.toISOString().slice(0, 10);
              const targetBedtime = log?.recommendedBedtime ?? userBedtime;

              return (
                <div key={dateStr} className={`border-b border-[#E5E5E5] last:border-0 ${isToday ? "bg-[#FAFAFA]" : ""}`}>
                  {/* Main row */}
                  <div className="grid grid-cols-5 gap-px bg-[#E5E5E5]">
                    <div className="bg-white px-4 py-3 flex items-center">
                      <p className="text-xs font-mono font-bold">
                        {formatDateLabel(dateStr)}
                        {isToday && <span className="ml-2 text-[#E8FF00] bg-[#0A0A0A] px-1 text-[9px] uppercase tracking-wider">Today</span>}
                      </p>
                    </div>
                    <div className="bg-white px-4 py-3 flex items-center">
                      <p className="text-xs font-mono">{formatTime12h(targetBedtime)}</p>
                    </div>
                    <div className="bg-white px-4 py-3 flex items-center">
                      {log?.actualBedtime ? (
                        <p className="text-xs font-mono">{formatTime12h(log.actualBedtime)}</p>
                      ) : (
                        <p className="text-xs font-mono text-[#6B6B6B]">—</p>
                      )}
                    </div>
                    <div className="bg-white px-4 py-3 flex items-center">
                      {log ? <DeviationBadge log={log} /> : <span className="text-xs font-mono text-[#6B6B6B]">—</span>}
                    </div>
                    <div className="bg-white px-4 py-3 flex items-center justify-between">
                      <StatusBadge log={log} />
                      {!isToday && (
                        <button
                          onClick={() => setRowState(dateStr, { mode: row.mode === "view" ? (log ? "edit" : "log") : "view" })}
                          className="text-[10px] font-bold uppercase tracking-wider border border-[#E5E5E5] px-2 py-0.5 text-[#6B6B6B] hover:border-[#0A0A0A] hover:text-[#0A0A0A] transition-colors ml-2"
                        >
                          {log ? "Edit" : "Log"} →
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Expanded log/edit UI */}
                  {isExpanded && (
                    <div className="px-6 py-4 bg-[#FAFAFA] border-t border-[#E5E5E5]">
                      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#6B6B6B] mb-3">
                        {log ? "Edit Log" : "Log Last Night"}
                      </p>
                      <div className="flex gap-px mb-3">
                        <button
                          onClick={() => submitLog(dateStr, true, log)}
                          disabled={row.saving}
                          className="flex-1 py-2 bg-[#0A0A0A] text-white font-black text-xs uppercase tracking-widest hover:bg-[#333] transition-colors disabled:opacity-50"
                        >
                          Hit Target
                        </button>
                        <button
                          onClick={() => setRowState(dateStr, { hitTarget: false })}
                          className={`flex-1 py-2 border font-black text-xs uppercase tracking-widest transition-colors ${
                            row.hitTarget === false
                              ? "border-[#0A0A0A] bg-white text-[#0A0A0A]"
                              : "border-[#E5E5E5] text-[#6B6B6B] hover:border-[#0A0A0A]"
                          }`}
                        >
                          Missed
                        </button>
                      </div>

                      {row.hitTarget === false && (
                        <div className="space-y-2 mb-3">
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[10px] font-bold uppercase tracking-wider text-[#6B6B6B] mb-1">Went to bed at:</label>
                              <input
                                type="time"
                                value={row.actualBedtime}
                                onChange={(e) => setRowState(dateStr, { actualBedtime: e.target.value })}
                                className="w-full border border-[#E5E5E5] px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#0A0A0A]"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold uppercase tracking-wider text-[#6B6B6B] mb-1">Woke up at: <span className="text-[#AAAAAA]">(optional)</span></label>
                              <input
                                type="time"
                                value={row.actualWakeTime}
                                onChange={(e) => setRowState(dateStr, { actualWakeTime: e.target.value })}
                                className="w-full border border-[#E5E5E5] px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#0A0A0A]"
                              />
                            </div>
                          </div>
                          <button
                            onClick={() => submitLog(dateStr, false, log)}
                            disabled={row.saving || !row.actualBedtime}
                            className="w-full py-2 bg-[#0A0A0A] text-white font-black text-xs uppercase tracking-widest hover:bg-[#333] transition-colors disabled:opacity-40"
                          >
                            {row.saving ? "Saving…" : "Confirm"}
                          </button>
                        </div>
                      )}

                      <button
                        onClick={() => setRowState(dateStr, { mode: "view", hitTarget: null })}
                        className="text-[10px] font-mono text-[#6B6B6B] hover:text-[#0A0A0A]"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </FadeUp>
      </div>
      <Footer />
    </div>
  );
}
