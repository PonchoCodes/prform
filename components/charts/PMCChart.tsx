"use client";
import {
  ComposedChart,
  Line,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { PMCPoint } from "@/lib/performanceAnalysis";

interface Props {
  data: PMCPoint[];
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload as PMCPoint;
  return (
    <div className="bg-[#0A0A0A] border border-[#333] p-3 text-xs font-mono">
      <p className="text-[#6B6B6B] mb-2">{label}</p>
      <p className="text-white">CTL <span className="text-white font-bold">{d.ctl}</span></p>
      <p className="text-[#E8FF00]">ATL <span className="font-bold">{d.atl}</span></p>
      <p className={d.tsb >= 0 ? "text-green-400" : "text-red-400"}>
        TSB <span className="font-bold">{d.tsb}</span>
      </p>
      {d.tss > 0 && <p className="text-[#6B6B6B] mt-1">TSS {d.tss}</p>}
    </div>
  );
};

export function PMCChart({ data }: Props) {
  const ticked = data.filter((_, i) => i % 7 === 0).map((d) => d.date);

  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <XAxis
          dataKey="date"
          ticks={ticked}
          tick={{ fontFamily: "var(--font-geist-mono)", fontSize: 10, fill: "#6B6B6B" }}
          tickFormatter={(v) => {
            const d = new Date(v);
            return `${d.getMonth() + 1}/${d.getDate()}`;
          }}
          axisLine={{ stroke: "#E5E5E5" }}
          tickLine={false}
        />
        <YAxis
          tick={{ fontFamily: "var(--font-geist-mono)", fontSize: 10, fill: "#6B6B6B" }}
          axisLine={false}
          tickLine={false}
          width={32}
        />
        <Tooltip content={<CustomTooltip />} />
        <ReferenceLine y={0} stroke="#333" strokeDasharray="3 3" />
        <Bar dataKey="tsb" name="TSB" radius={0} isAnimationActive={false} fill="#16a34a">
          {data.map((entry, index) => (
            <Cell key={index} fill={entry.tsb >= 0 ? "#16a34a" : "#dc2626"} />
          ))}
        </Bar>
        <Line dataKey="ctl" name="CTL" stroke="#FFFFFF" strokeWidth={2} dot={false} isAnimationActive={false} />
        <Line dataKey="atl" name="ATL" stroke="#E8FF00" strokeWidth={2} dot={false} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
