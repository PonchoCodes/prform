"use client";

import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { useDarkMode } from "@/hooks/useDarkMode";
import { teamTrendCountdownCopy, type TeamTrend, type TeamTrendWeek } from "@/lib/teamTrend";

// Compliance and logging by week, with the team's hard sessions under them.
//
// Same construction as SleepPaceTrendChart: one chart, two rates on a 0–100
// axis so the scale cannot flatter a bad week, and a countdown instead of an
// empty axis until there is enough to draw. The hard sessions are bars on a
// hidden axis rather than a second chart, because the question is whether
// the load and the compliance move together, and that needs one x-axis.

interface Props {
  trend: TeamTrend;
}

interface WeekPoint extends TeamTrendWeek {
  hardSessions: number;
}

function shortDate(key: string): string {
  const [, m, d] = key.split("-");
  return `${Number(m)}/${Number(d)}`;
}

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload as WeekPoint;
  return (
    <div className="bg-[#0A0A0A] border border-[#333] p-3 text-[11px] font-mono">
      <p className="text-[#6B6B6B] mb-1.5">Week of {shortDate(p.weekStart)}</p>
      <p className="text-[#E8FF00]">
        Targets hit <span className="font-bold">{p.compliance ?? "–"}%</span>
      </p>
      <p className="text-white">
        Logged <span className="font-bold">{p.loggingRate ?? "–"}%</span>
        <span className="text-[#6B6B6B]">
          {" "}
          · {p.nightsLogged} of {p.nightsPossible}
        </span>
      </p>
      <p className="text-[#6B6B6B] mt-1.5">
        {p.shortNights} short night{p.shortNights === 1 ? "" : "s"} · {p.hardSessions} hard session
        {p.hardSessions === 1 ? "" : "s"}
      </p>
    </div>
  );
};

export function TeamTrendChart({ trend }: Props) {
  const isDark = useDarkMode();
  const axis = isDark ? "#A0A0A0" : "#6B6B6B";
  const grid = isDark ? "#2a2a2a" : "#E5E5E5";
  const ink = isDark ? "#F5F5F5" : "#0A0A0A";

  if (!trend.ready) {
    return (
      <div className="border border-dashed border-[#E5E5E5] dark:border-[#333] p-6">
        <p className="font-black uppercase leading-tight text-[clamp(18px,5vw,24px)] max-w-[22ch]">
          {teamTrendCountdownCopy(trend)}
        </p>
        <div className="mt-5 flex gap-6 text-[10px] font-mono uppercase tracking-wider text-[#6B6B6B]">
          <span>
            {trend.nightsLogged} night{trend.nightsLogged === 1 ? "" : "s"} logged
          </span>
        </div>
      </div>
    );
  }

  const points: WeekPoint[] = trend.weeks.map((w) => ({ ...w, hardSessions: w.hardSessionDays.length }));

  return (
    <div>
      <div className="bg-[#F5F5F5] dark:bg-[#0A0A0A] p-3 sm:p-4">
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={points} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
            <CartesianGrid stroke={grid} strokeDasharray="2 4" vertical={false} />

            <XAxis
              dataKey="weekStart"
              tickFormatter={shortDate}
              tick={{ fontFamily: "var(--font-geist-mono)", fontSize: 10, fill: axis }}
              axisLine={{ stroke: grid }}
              tickLine={false}
              minTickGap={16}
            />

            <YAxis
              yAxisId="rate"
              domain={[0, 100]}
              ticks={[0, 50, 100]}
              tickFormatter={(v) => `${v}%`}
              tick={{ fontFamily: "var(--font-geist-mono)", fontSize: 10, fill: axis }}
              axisLine={false}
              tickLine={false}
              width={36}
            />

            {/* Hard sessions per week, floored so the tallest bar stays under
                the lines rather than across them. */}
            <YAxis yAxisId="load" orientation="right" domain={[0, 14]} hide />

            <Tooltip content={<CustomTooltip />} cursor={{ stroke: axis, strokeWidth: 1 }} />

            <Bar
              yAxisId="load"
              dataKey="hardSessions"
              fill={ink}
              fillOpacity={0.14}
              isAnimationActive={false}
              barSize={18}
            />

            <Line
              yAxisId="rate"
              dataKey="loggingRate"
              stroke={ink}
              strokeWidth={2}
              connectNulls={false}
              dot={false}
              isAnimationActive={false}
            />

            <Line
              yAxisId="rate"
              dataKey="compliance"
              stroke="#E8FF00"
              strokeWidth={2}
              connectNulls={false}
              dot={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mt-3 text-[10px] font-mono uppercase tracking-wider text-[#6B6B6B] dark:text-[#A0A0A0]">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-[2px] bg-[#E8FF00]" />
          Targets hit
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-[2px] bg-[#0A0A0A] dark:bg-[#F5F5F5]" />
          Nights logged
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 bg-[#0A0A0A]/15 dark:bg-[#F5F5F5]/15" />
          Hard sessions
        </span>
        <span className="ml-auto">Weekly · last {trend.weeks.length} weeks</span>
      </div>
    </div>
  );
}
