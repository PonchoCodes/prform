"use client";

import { useEffect, useState } from "react";

// The retention page. Read by one person, so it is a set of tables rather than
// a dashboard: no sparklines, no cards, no summary tile that hides the number
// it summarises. The funnel is the thing, and a funnel reads best as rows.

interface Cohort {
  weekStart: string;
  signedUp: number;
  completedOnboarding: number;
  firstSleepLog: number;
  sevenConsecutiveDays: number;
  fourWeeks: number;
  fourWeeksMeasurable: boolean;
}

interface WeeklyActive {
  weekStart: string;
  active: number;
}

interface Group {
  teamId: string | null;
  label: string;
  members: number;
  everLogged: number;
  activeThisWeek: number;
  habitFormed: number;
  avgNightsLast28: number;
}

interface Payload {
  generatedAt: string;
  totals: { users: number; everLogged: number; teams: number };
  cohorts: Cohort[];
  weeklyActive: WeeklyActive[];
  groups: Group[];
  messages: {
    dryRun: number;
    sent: number;
    delivered: number;
    failed: number;
    canceled: number;
    scheduled: number;
    replied: number;
    dryRunOnly: boolean;
  };
}

const TH =
  "text-left text-[10px] font-bold uppercase tracking-[0.2em] text-[#6B6B6B] dark:text-[#A0A0A0] px-3 py-2 whitespace-nowrap";
const TD = "px-3 py-2 font-mono text-sm tabular-nums whitespace-nowrap";

function formatWeek(key: string): string {
  return new Date(`${key}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/** "12 (48%)". The denominator is always the previous funnel step. */
function withRate(value: number, of: number): string {
  if (of === 0) return String(value);
  return `${value} (${Math.round((value / of) * 100)}%)`;
}

export function AdminRetention() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/admin/retention")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setError(true));
  }, []);

  if (error) {
    return (
      <div className="min-h-screen bg-white dark:bg-[#1a1a1a] p-10">
        <p className="font-mono text-sm">Couldn&apos;t load retention data.</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="min-h-screen bg-white dark:bg-[#1a1a1a] p-10">
        <p className="font-mono text-sm text-[#6B6B6B]">Loading…</p>
      </div>
    );
  }

  const maxActive = Math.max(1, ...data.weeklyActive.map((w) => w.active));

  return (
    <div className="min-h-screen bg-white dark:bg-[#1a1a1a] text-[#0A0A0A] dark:text-[#F5F5F5]">
      <section className="bg-[#0A0A0A] px-6 py-10">
        <div className="max-w-[1200px] mx-auto">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] mb-2">
            Internal
          </p>
          <h1 className="font-black text-4xl uppercase text-white">Retention</h1>
          <p className="text-[#6B6B6B] text-xs font-mono mt-2">
            {data.totals.users} accounts · {data.totals.everLogged} have logged a night ·{" "}
            {data.totals.teams} teams
          </p>
        </div>
      </section>

      <div className="max-w-[1200px] mx-auto px-6 py-10 space-y-14">
        {/* ── Funnel ─────────────────────────────────────────────────────── */}
        <section>
          <h2 className="font-black text-2xl uppercase mb-1">Signup cohorts</h2>
          <p className="text-xs font-mono text-[#6B6B6B] dark:text-[#A0A0A0] mb-6 max-w-3xl">
            Each percentage is against the step to its left. Seven consecutive days is strict:
            no skips, no holds.
          </p>
          <div className="overflow-x-auto border border-[#E5E5E5] dark:border-[#333]">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-[#E5E5E5] dark:border-[#333]">
                  <th className={TH}>Week of</th>
                  <th className={TH}>Signed up</th>
                  <th className={TH}>Onboarded</th>
                  <th className={TH}>First log</th>
                  <th className={TH}>7 days in a row</th>
                  <th className={TH}>Active week 4</th>
                </tr>
              </thead>
              <tbody>
                {data.cohorts.map((c) => (
                  <tr key={c.weekStart} className="border-b border-[#E5E5E5] dark:border-[#333] last:border-0">
                    <td className={`${TD} font-bold`}>{formatWeek(c.weekStart)}</td>
                    <td className={TD}>{c.signedUp}</td>
                    <td className={TD}>{withRate(c.completedOnboarding, c.signedUp)}</td>
                    <td className={TD}>{withRate(c.firstSleepLog, c.completedOnboarding)}</td>
                    <td className={TD}>{withRate(c.sevenConsecutiveDays, c.firstSleepLog)}</td>
                    <td className={`${TD} text-[#6B6B6B] dark:text-[#A0A0A0]`}>
                      {/* A cohort younger than four weeks has not failed to
                          reach week four; it has not got there yet. Showing 0%
                          would read as a collapse. */}
                      {c.fourWeeksMeasurable ? (
                        <span className="text-[#0A0A0A] dark:text-[#F5F5F5]">
                          {withRate(c.fourWeeks, c.firstSleepLog)}
                        </span>
                      ) : (
                        "too soon"
                      )}
                    </td>
                  </tr>
                ))}
                {data.cohorts.length === 0 && (
                  <tr>
                    <td className={`${TD} text-[#6B6B6B]`} colSpan={6}>
                      No accounts yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Weekly active ──────────────────────────────────────────────── */}
        <section>
          <h2 className="font-black text-2xl uppercase mb-1">Weekly active</h2>
          <p className="text-xs font-mono text-[#6B6B6B] dark:text-[#A0A0A0] mb-6 max-w-3xl">
            Athletes who logged at least one night that week. Not opens, not page views.
          </p>
          <div className="space-y-px bg-[#E5E5E5] dark:bg-[#333] border border-[#E5E5E5] dark:border-[#333]">
            {data.weeklyActive.map((w) => (
              <div key={w.weekStart} className="bg-white dark:bg-[#242424] flex items-center gap-4 px-3 py-2">
                <span className="font-mono text-xs w-16 shrink-0 text-[#6B6B6B] dark:text-[#A0A0A0]">
                  {formatWeek(w.weekStart)}
                </span>
                {/* A bar, not a chart. One reader, one number per row. */}
                <span
                  className="h-3 bg-[#0A0A0A] dark:bg-[#F5F5F5] shrink-0"
                  style={{ width: `${Math.round((w.active / maxActive) * 100)}%` }}
                  aria-hidden="true"
                />
                <span className="font-mono text-sm tabular-nums">{w.active}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ── Teams vs solo ──────────────────────────────────────────────── */}
        <section>
          <h2 className="font-black text-2xl uppercase mb-1">Teams and solo</h2>
          <p className="text-xs font-mono text-[#6B6B6B] dark:text-[#A0A0A0] mb-6 max-w-3xl">
            An athlete on two teams counts in both rows, so these do not sum to the account
            total.
          </p>
          <div className="overflow-x-auto border border-[#E5E5E5] dark:border-[#333]">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-[#E5E5E5] dark:border-[#333]">
                  <th className={TH}>Group</th>
                  <th className={TH}>Members</th>
                  <th className={TH}>Ever logged</th>
                  <th className={TH}>Active this week</th>
                  <th className={TH}>7 days in a row</th>
                  <th className={TH}>Avg nights / 28d</th>
                </tr>
              </thead>
              <tbody>
                {data.groups.map((g) => (
                  <tr
                    key={g.teamId ?? "solo"}
                    className="border-b border-[#E5E5E5] dark:border-[#333] last:border-0"
                  >
                    <td className={`${TD} font-bold`}>{g.label}</td>
                    <td className={TD}>{g.members}</td>
                    <td className={TD}>{withRate(g.everLogged, g.members)}</td>
                    <td className={TD}>{withRate(g.activeThisWeek, g.members)}</td>
                    <td className={TD}>{withRate(g.habitFormed, g.members)}</td>
                    <td className={TD}>{g.avgNightsLast28}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Messages ───────────────────────────────────────────────────── */}
        <section>
          <h2 className="font-black text-2xl uppercase mb-1">Messages</h2>
          <p className="text-xs font-mono text-[#6B6B6B] dark:text-[#A0A0A0] mb-6 max-w-3xl">
            {data.messages.dryRunOnly
              ? "Nothing has been handed to a provider yet. These are dry-run rows."
              : "Counted from the send ledger, across both texts and notifications."}
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-[#E5E5E5] dark:bg-[#333] border border-[#E5E5E5] dark:border-[#333]">
            {[
              ["Sent", data.messages.sent],
              ["Delivered", data.messages.delivered],
              ["Replied", data.messages.replied],
              ["Failed", data.messages.failed],
              ["Scheduled", data.messages.scheduled],
              ["Canceled", data.messages.canceled],
              ["Dry run", data.messages.dryRun],
            ].map(([label, value]) => (
              <div key={label as string} className="bg-white dark:bg-[#242424] p-4">
                <p className="font-mono font-black text-3xl leading-none tabular-nums">{value}</p>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#6B6B6B] dark:text-[#A0A0A0] mt-1">
                  {label}
                </p>
              </div>
            ))}
          </div>
        </section>

        <p className="text-[10px] font-mono text-[#6B6B6B] dark:text-[#A0A0A0]">
          Generated {new Date(data.generatedAt).toLocaleString()} from this app&apos;s own
          database. No third-party analytics.
        </p>
      </div>
    </div>
  );
}
