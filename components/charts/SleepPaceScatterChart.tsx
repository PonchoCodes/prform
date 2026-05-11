"use client";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { ScatterPoint } from "@/lib/performanceAnalysis";

interface Props {
  data: ScatterPoint[];
  correlation: number;
}

const DOT_STYLES: Record<ScatterPoint["bin"], { fill: string; stroke: string }> = {
  optimal: { fill: "#FFFFFF", stroke: "#0A0A0A" },
  moderate: { fill: "#6B6B6B", stroke: "#6B6B6B" },
  significant: { fill: "#D0D0D0", stroke: "#D0D0D0" },
};

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload as ScatterPoint;
  return (
    <div className="bg-[#0A0A0A] border border-[#333] p-3 text-xs font-mono">
      <p className="text-[#6B6B6B] mb-1">{d.date}</p>
      <p className="text-white">{d.sleepHours}h sleep</p>
      <p className="text-[#E8FF00]">Score: {d.paceScore > 0 ? "+" : ""}{d.paceScore}</p>
      <p className="text-[#6B6B6B] capitalize">{d.bin} sleep</p>
    </div>
  );
};

// Simple linear regression line points
function regressionPoints(data: ScatterPoint[]): { x: number; y: number }[] {
  if (data.length < 2) return [];
  const xs = data.map((d) => d.sleepHours);
  const ys = data.map((d) => d.paceScore);
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  const slope = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) /
    xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  const intercept = my - slope * mx;
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  return [
    { x: minX, y: slope * minX + intercept },
    { x: maxX, y: slope * maxX + intercept },
  ];
}

export function SleepPaceScatterChart({ data, correlation }: Props) {
  const optimal = data.filter((d) => d.bin === "optimal");
  const moderate = data.filter((d) => d.bin === "moderate");
  const significant = data.filter((d) => d.bin === "significant");
  const regLine = regressionPoints(data);

  return (
    <div>
      <ResponsiveContainer width="100%" height={280}>
        <ScatterChart margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
          <XAxis
            dataKey="sleepHours"
            type="number"
            name="Sleep"
            unit="h"
            domain={["auto", "auto"]}
            tick={{ fontFamily: "var(--font-geist-mono)", fontSize: 10, fill: "#6B6B6B" }}
            axisLine={{ stroke: "#E5E5E5" }}
            tickLine={false}
            label={{ value: "Sleep (hrs)", position: "insideBottom", offset: -4, fontSize: 10, fill: "#6B6B6B", fontFamily: "var(--font-geist-mono)" }}
          />
          <YAxis
            dataKey="paceScore"
            type="number"
            name="Pace Score"
            tick={{ fontFamily: "var(--font-geist-mono)", fontSize: 10, fill: "#6B6B6B" }}
            axisLine={false}
            tickLine={false}
            width={36}
            label={{ value: "Score", angle: -90, position: "insideLeft", fontSize: 10, fill: "#6B6B6B", fontFamily: "var(--font-geist-mono)" }}
          />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine y={0} stroke="#E5E5E5" />
          <Scatter name="Optimal" data={optimal} fill={DOT_STYLES.optimal.fill} stroke={DOT_STYLES.optimal.stroke} strokeWidth={1.5} r={5} isAnimationActive={false} />
          <Scatter name="Moderate" data={moderate} fill={DOT_STYLES.moderate.fill} stroke={DOT_STYLES.moderate.stroke} r={5} isAnimationActive={false} />
          <Scatter name="Significant" data={significant} fill={DOT_STYLES.significant.fill} stroke={DOT_STYLES.significant.stroke} r={5} isAnimationActive={false} />
          {regLine.length === 2 && (
            <ReferenceLine
              segment={regLine as [{ x: number; y: number }, { x: number; y: number }]}
              stroke="#E8FF00"
              strokeWidth={2}
              ifOverflow="extendDomain"
            />
          )}
        </ScatterChart>
      </ResponsiveContainer>
      <div className="flex gap-4 text-xs font-mono text-[#6B6B6B] mt-2">
        <span><span className="inline-block w-2 h-2 border border-[#0A0A0A] bg-white mr-1" />Optimal sleep</span>
        <span><span className="inline-block w-2 h-2 bg-[#6B6B6B] mr-1" />Moderate deficit</span>
        <span><span className="inline-block w-2 h-2 bg-[#D0D0D0] mr-1" />Significant deficit</span>
        <span className="ml-auto">r = {correlation}</span>
      </div>
    </div>
  );
}
