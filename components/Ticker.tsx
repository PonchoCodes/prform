"use client";

interface TickerProps {
  items: string[];
}

export function Ticker({ items }: TickerProps) {
  const doubled = [...items, ...items];

  return (
    <div className="overflow-hidden border-y border-[#E5E5E5] py-3 bg-white">
      <div className="ticker-track">
        {doubled.map((item, i) => (
          <span key={i} className="whitespace-nowrap px-8 text-sm font-bold uppercase tracking-widest text-[#0A0A0A]">
            {item}
            <span className="mx-6 text-[#E8FF00]">◆</span>
          </span>
        ))}
      </div>
    </div>
  );
}
