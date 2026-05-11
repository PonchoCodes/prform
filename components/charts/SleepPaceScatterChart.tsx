"use client";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
} from "recharts";
import type { ScatterPoint } from "@/lib/performanceAnalysis";

interface Props {
  data: ScatterPoint[];
  correlation: number;
}

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload as ScatterPoint;
  const sign = d.deviationMin >= 0 ? "+" : "";
  return (
    <div className="bg-[#0A0A0A] border border-[#333] p-3 text-xs font-mono min-w-[180px]">
      <p className="text-[#6B6B6B] mb-1">{d.date}</p>
      <p className="text-white truncate max-w-[200px]">{d.activityName}</p>
      <p className="text-[#E8FF00] mt-1">Pace: {d.paceMinKm}/km</p>
      <p className="text-white">Score: {d.paceScore > 0 ? "+" : ""}{d.paceScore}</p>
      <p className="text-[#6B6B6B] mt-1">Deviation: {sign}{d.deviationMin} min</p>
      <p className="text-[#6B6B6B]">PRform target: {d.targetBedtime}</p>
      <p className="text-[#6B6B6B] mt-1">{d.confirmed ? "● Confirmed" : "○ Estimated"}</p>
    </div>
  );
};

function regressionLine(data: ScatterPoint[]): { x: number; y: number }[] {
  if (data.length < 2) return [];
  const xs = data.map((d) => d.deviationMin);
  const ys = data.map((d) => d.paceScore);
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  const slope = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) /
    (xs.reduce((s, x) => s + (x - mx) ** 2, 0) || 1);
  const intercept = my - slope * mx;
  return [
    { x: -120, y: slope * -120 + intercept },
    { x: 60, y: slope * 60 + intercept },
  ];
}

export function SleepPaceScatterChart({ data, correlation }: Props) {
  const regLine = regressionLine(data);
  const confirmedData = data.filter((d) => d.confirmed);
  const estimatedData = data.filter((d) => !d.confirmed);
  const confirmedCount = confirmedData.length;

  return (
    <div>
      {/* HOW THIS WORKS explainer */}
      <div className="border border-[#E5E5E5] p-4 mb-6 bg-[#FAFAFA]">
        <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#6B6B6B] mb-2">How This Works</p>
        <p className="text-xs font-mono text-[#6B6B6B] leading-relaxed">
          PRform calculates a target bedtime each day based on your training load and sleep need.
          Each dot is one of your runs. The X axis shows how far your estimated bedtime was from
          that day&apos;s PRform target — left is late, right is early.
          The Y axis is your pace score (z-score vs. your average).
          The yellow line is the trend.{" "}
          {confirmedCount > 0 && (
            <>Solid dots use your confirmed sleep times from your log ({confirmedCount} nights). Open dots use an estimate.</>
          )}
        </p>
      </div>

      <div className="bg-[#0A0A0A] p-4">
        <ResponsiveContainer width="100%" height={300}>
          <ScatterChart margin={{ top: 16, right: 24, left: 0, bottom: 24 }}>
            {/* Background zones */}
            <ReferenceArea x1={-120} x2={-30} fill="#1a0a0a" fillOpacity={0.6} />
            <ReferenceArea x1={-30} x2={15} fill="#111111" fillOpacity={0} />
            <ReferenceArea x1={15} x2={60} fill="#0a1a0a" fillOpacity={0.6} />

            <XAxis
              dataKey="deviationMin"
              type="number"
              domain={[-120, 60]}
              ticks={[-120, -90, -60, -30, 0, 15, 30, 60]}
              tick={{ fontFamily: "var(--font-geist-mono)", fontSize: 9, fill: "#6B6B6B" }}
              axisLine={{ stroke: "#333" }}
              tickLine={false}
              label={{
                value: "Bedtime vs. Target (min)  ← late · early →",
                position: "insideBottom",
                offset: -14,
                fontSize: 9,
                fill: "#6B6B6B",
                fontFamily: "var(--font-geist-mono)",
              }}
            />
            <YAxis
              dataKey="paceScore"
              type="number"
              tick={{ fontFamily: "var(--font-geist-mono)", fontSize: 9, fill: "#6B6B6B" }}
              axisLine={false}
              tickLine={false}
              width={36}
              label={{
                value: "Pace Score",
                angle: -90,
                position: "insideLeft",
                fontSize: 9,
                fill: "#6B6B6B",
                fontFamily: "var(--font-geist-mono)",
              }}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: "#333" }} />
            <ReferenceLine y={0} stroke="#333" />
            <ReferenceLine x={0} stroke="#444" strokeDasharray="4 4" />

            {/* Confirmed dots — solid fill */}
            {confirmedData.length > 0 && (
              <Scatter
                data={confirmedData}
                fill="#0A0A0A"
                stroke="#FFFFFF"
                strokeWidth={1.5}
                r={4}
                isAnimationActive={false}
              />
            )}

            {/* Estimated dots — hollow */}
            {estimatedData.length > 0 && (
              <Scatter
                data={estimatedData}
                fill="#FFFFFF"
                fillOpacity={0.15}
                stroke="#FFFFFF"
                strokeWidth={1}
                r={4}
                isAnimationActive={false}
              />
            )}

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
      </div>

      <div className="flex items-center gap-6 mt-3 text-[10px] font-mono text-[#6B6B6B]">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-[2px] bg-[#E8FF00]" />
          Trend line
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 border border-white bg-[#0A0A0A]" />
          Confirmed nights
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 border border-white bg-transparent opacity-60" />
          Estimated nights
        </span>
        <span className="ml-auto">r = {correlation}</span>
      </div>

      <div className="flex gap-px mt-2 text-[9px] font-mono uppercase tracking-wider">
        <div className="flex-1 bg-red-50 text-red-400 text-center py-0.5">← Late</div>
        <div className="flex-1 bg-white border-x border-[#E5E5E5] text-[#6B6B6B] text-center py-0.5">On Target</div>
        <div className="flex-1 bg-green-50 text-green-600 text-center py-0.5">Early →</div>
      </div>
    </div>
  );
}
