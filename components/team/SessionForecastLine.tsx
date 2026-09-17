"use client";

// One planned session's forecast, under its row in the table.
//
// A hard session shows the whole split; an easy one shows only the not-ready
// count, and only when it is nonzero, because "everyone can jog" is not
// information. The shift line is the one suggestion the forecast is allowed
// to make per row.

export interface SessionForecastRow {
  sessionId: string;
  hard: boolean;
  ready: number;
  marginal: number;
  notReady: number;
  unlogged: number;
  flags: string[];
  shift: string | null;
}

export function SessionForecastLine({ forecast }: { forecast: SessionForecastRow | undefined }) {
  if (!forecast) return null;
  if (!forecast.hard && forecast.notReady === 0) return null;

  return (
    <div className="mt-2 pl-32 space-y-1">
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-mono tabular-nums">
        {forecast.hard && (
          <>
            <span>
              <span className="font-bold">{forecast.ready}</span> ready
            </span>
            <span className="text-[#6B6B6B] dark:text-[#A0A0A0]">·</span>
            <span>
              <span className="font-bold">{forecast.marginal}</span> marginal
            </span>
            <span className="text-[#6B6B6B] dark:text-[#A0A0A0]">·</span>
          </>
        )}
        <span className={forecast.notReady > 0 ? "text-[#FF4444]" : ""}>
          <span className="font-bold">{forecast.notReady}</span> not ready
        </span>
        {forecast.flags.map((f) => (
          <span key={f} className="text-[#6B6B6B] dark:text-[#A0A0A0]">
            {f}
          </span>
        ))}
      </p>
      {forecast.shift && (
        <p className="text-xs border-l-2 border-[#E8FF00] pl-2">{forecast.shift}</p>
      )}
    </div>
  );
}
