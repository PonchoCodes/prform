"use client";

import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { useDarkMode } from "@/hooks/useDarkMode";
import { trendCountdownCopy, type TrendPoint, type TrendResult } from "@/lib/trend";

interface Props {
  trend: TrendResult;
  /** Prompts for the one input that would unlock the pace series. */
  onAddPr?: () => void;
  hasPaces?: boolean;
  windowDays?: number;
}

function shortDate(key: string): string {
  const [, m, d] = key.split("-");
  return `${Number(m)}/${Number(d)}`;
}

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload as TrendPoint;
  return (
    <div className="bg-[#0A0A0A] border border-[#333] p-3 text-[11px] font-mono">
      <p className="text-[#6B6B6B] mb-1.5">7 days to {shortDate(p.date)}</p>
      <p className="text-white">
        Slept <span className="font-bold">{p.sleepHours ?? "—"}h</span>
        {p.targetHours != null && <span className="text-[#6B6B6B]"> of {p.targetHours}h</span>}
      </p>
      <p className="text-[#E8FF00]">
        On target <span className="font-bold">{p.compliance ?? "—"}%</span>
      </p>
      <p className="text-[#6B6B6B] mt-1.5">
        {p.nightsInWindow} night{p.nightsInWindow === 1 ? "" : "s"} · {p.runsInWindow} run
        {p.runsInWindow === 1 ? "" : "s"}
      </p>
    </div>
  );
};

/**
 * Sleep against pace compliance, both as 7-day rolling means.
 *
 * One chart, not a grid: the question is whether sleeping more predicts hitting
 * prescribed paces, and that is a single comparison. Sleep is plotted as hours
 * rather than debt so the two series rise and fall together when the thesis
 * holds — a debt series would invert one of them and read as divergence.
 */
export function SleepPaceTrendChart({ trend, onAddPr, hasPaces = true, windowDays }: Props) {
  const isDark = useDarkMode();
  const axis = isDark ? "#A0A0A0" : "#6B6B6B";
  const grid = isDark ? "#2a2a2a" : "#E5E5E5";
  const sleepStroke = isDark ? "#F5F5F5" : "#0A0A0A";

  if (!trend.ready) {
    return (
      <div className="border border-dashed border-[#E5E5E5] dark:border-[#333] p-6">
        <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#6B6B6B] dark:text-[#A0A0A0] mb-3">
          Building your trend
        </p>
        {/* Forward-looking and countable. An empty axis would be a chart of
            nothing; this is a number that goes down every time they log. */}
        <p className="font-black uppercase leading-tight text-[clamp(18px,5vw,24px)] max-w-[22ch]">
          {trendCountdownCopy(trend)}
        </p>
        <p className="mt-3 text-xs font-mono text-[#6B6B6B] dark:text-[#A0A0A0] leading-relaxed max-w-[52ch]">
          {hasPaces
            ? "Then you'll see whether sleeping more actually moves your paces — measured on you, not on a study."
            : "Pace compliance needs a pace to measure against."}
        </p>
        {!hasPaces && onAddPr && (
          <button
            onClick={onAddPr}
            className="mt-4 inline-flex items-center min-h-[44px] px-4 text-[11px] font-bold uppercase tracking-widest border border-[#0A0A0A] dark:border-[#F5F5F5] text-[#0A0A0A] dark:text-[#F5F5F5] hover:bg-[#E8FF00] hover:border-[#E8FF00] hover:text-[#0A0A0A] transition-colors"
          >
            Add a race PR →
          </button>
        )}
        <div className="mt-5 flex gap-6 text-[10px] font-mono uppercase tracking-wider text-[#6B6B6B]">
          <span>
            {trend.nightsLogged} night{trend.nightsLogged === 1 ? "" : "s"} logged
          </span>
          <span>
            {trend.runsScored} run{trend.runsScored === 1 ? "" : "s"} scored
          </span>
        </div>
      </div>
    );
  }

  // Roughly one label a fortnight on a phone; Recharts drops the rest rather
  // than overlapping them.
  const tickEvery = Math.max(1, Math.floor(trend.points.length / 5));
  const ticks = trend.points.filter((_, i) => i % tickEvery === 0).map((p) => p.date);

  return (
    <div>
      <div className="bg-[#F5F5F5] dark:bg-[#0A0A0A] p-3 sm:p-4">
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={trend.points} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
            <CartesianGrid stroke={grid} strokeDasharray="2 4" vertical={false} />

            <XAxis
              dataKey="date"
              ticks={ticks}
              tickFormatter={shortDate}
              tick={{ fontFamily: "var(--font-geist-mono)", fontSize: 10, fill: axis }}
              axisLine={{ stroke: grid }}
              tickLine={false}
              minTickGap={16}
            />

            {/* Left: hours slept. Domain floored well below any real night so the
                shape of the series is visible rather than pinned to the top. */}
            <YAxis
              yAxisId="sleep"
              domain={[4, 10]}
              ticks={[4, 6, 8, 10]}
              tickFormatter={(v) => `${v}h`}
              tick={{ fontFamily: "var(--font-geist-mono)", fontSize: 10, fill: axis }}
              axisLine={false}
              tickLine={false}
              width={36}
            />

            {/* Right: compliance, always 0–100 so the scale can't flatter a bad week. */}
            <YAxis
              yAxisId="pace"
              orientation="right"
              domain={[0, 100]}
              ticks={[0, 50, 100]}
              tickFormatter={(v) => `${v}%`}
              tick={{ fontFamily: "var(--font-geist-mono)", fontSize: 10, fill: axis }}
              axisLine={false}
              tickLine={false}
              width={36}
            />

            <Tooltip content={<CustomTooltip />} cursor={{ stroke: axis, strokeWidth: 1 }} />

            <Area
              yAxisId="sleep"
              dataKey="sleepHours"
              stroke={sleepStroke}
              strokeWidth={2}
              fill={sleepStroke}
              fillOpacity={0.08}
              connectNulls={false}
              dot={false}
              isAnimationActive={false}
            />

            <Line
              yAxisId="pace"
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
          <span className="inline-block w-3 h-[2px] bg-[#0A0A0A] dark:bg-[#F5F5F5]" />
          Hours slept
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-[2px] bg-[#E8FF00]" />
          Paces hit
        </span>
        <span className="ml-auto">7-day rolling{windowDays ? ` · last ${windowDays}d` : ""}</span>
      </div>
    </div>
  );
}
