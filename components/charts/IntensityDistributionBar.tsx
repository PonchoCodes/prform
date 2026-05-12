"use client";

interface Props {
  zone1Pct: number;
  zone2Pct: number;
  zone3Pct: number;
}

export function IntensityDistributionBar({ zone1Pct, zone2Pct, zone3Pct }: Props) {
  return (
    <div className="w-full h-6 flex">
      <div
        className="h-full bg-white dark:bg-[#242424] border-r border-[#0A0A0A] transition-all duration-700"
        style={{ width: `${zone1Pct}%` }}
        title={`Zone 1: ${zone1Pct}%`}
      />
      <div
        className="h-full bg-[#6B6B6B] border-r border-[#0A0A0A] transition-all duration-700"
        style={{ width: `${zone2Pct}%` }}
        title={`Zone 2: ${zone2Pct}%`}
      />
      <div
        className="h-full bg-[#E8FF00] transition-all duration-700"
        style={{ width: `${zone3Pct}%` }}
        title={`Zone 3: ${zone3Pct}%`}
      />
    </div>
  );
}
