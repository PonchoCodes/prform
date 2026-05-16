export interface PerformancePrediction {
  event: string;
  referenceTime: number;       // seconds
  referenceLabel: "PR" | "Season Best";
  avgDeficitHours: number;
  paceChangePct: number;
  predictedTime: number;       // seconds
  timeDifference: number;      // seconds, positive = slower
  confidenceNights: number;
  totalNights: number;
  isEstimated: boolean;
  unit: string;                // "seconds" | "mmss"
  remainingNights: number;
  potentialImprovementSeconds: number;
}

export interface MeetForPrediction {
  id: string;
  date: Date | string;
  primaryEvent: string | null;
  personalBest: string | null;
  recentBest: string | null;
  personalBestUnit: string | null;
}

export interface SleepLogForPrediction {
  date: string;                // YYYY-MM-DD
  hitTarget: boolean | null;
  actualBedtime: string | null;
  recommendedBedtime: string | null;
}

export interface UserForPrediction {
  currentBedTime: string | null;
}

// Events expressed in seconds (short track, typically sub-60s individually)
const SECONDS_EVENTS = new Set([
  "100m", "200m", "400m", "110m Hurdles", "400m Hurdles", "4x100 Relay",
]);

export function getUnitForEvent(event: string): "seconds" | "mmss" {
  return SECONDS_EVENTS.has(event) ? "seconds" : "mmss";
}

export function getPlaceholderForEvent(event: string): string {
  const unit = getUnitForEvent(event);
  if (unit === "seconds") return "e.g. 51.8 (seconds)";
  const roadXC = [
    "5K", "10K", "15K", "Half Marathon", "Marathon",
    "3 Mile", "4K", "6K", "8K",
  ];
  if (roadXC.includes(event)) return "e.g. 16:42 (MM:SS)";
  return "e.g. 1:52.4 (MM:SS.s)";
}

export function parseTimeToSeconds(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(":");
  if (parts.length === 1) {
    const s = parseFloat(parts[0]);
    return isNaN(s) ? null : s;
  } else if (parts.length === 2) {
    const m = parseInt(parts[0], 10);
    const s = parseFloat(parts[1]);
    if (isNaN(m) || isNaN(s)) return null;
    return m * 60 + s;
  } else if (parts.length === 3) {
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const s = parseFloat(parts[2]);
    if (isNaN(h) || isNaN(m) || isNaN(s)) return null;
    return h * 3600 + m * 60 + s;
  }
  return null;
}

// Convert stored numeric seconds string back to display format for editing
export function formatSecondsForDisplay(secondsStr: string, unit: string): string {
  const total = parseFloat(secondsStr);
  if (isNaN(total)) return secondsStr;
  if (unit === "seconds") return String(Math.round(total * 10) / 10);
  return secondsToMmss(total);
}

function secondsToMmss(total: number): string {
  const rounded = Math.round(total * 10) / 10;
  const mins = Math.floor(rounded / 60);
  const secsRaw = Math.round((rounded - mins * 60) * 10) / 10;
  const secsInt = Math.floor(secsRaw);
  const secsFrac = Math.round((secsRaw - secsInt) * 10);
  const secsStr = secsFrac > 0
    ? `${String(secsInt).padStart(2, "0")}.${secsFrac}`
    : String(secsInt).padStart(2, "0");
  if (mins === 0) return `0:${secsStr}`;
  if (mins < 60) return `${mins}:${secsStr}`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return `${hours}:${String(remMins).padStart(2, "0")}:${secsStr}`;
}

// Display formatted time for prediction output (e.g. "52.3s" or "16:53")
export function formatTimeFromSeconds(seconds: number, unit: string): string {
  const rounded = Math.round(seconds * 10) / 10;
  if (unit === "seconds") return `${rounded}s`;
  return secondsToMmss(rounded);
}

// Format a time difference for display (e.g. "+12s", "-1:23")
export function formatTimeDifference(diffSeconds: number): string {
  const abs = Math.abs(diffSeconds);
  const sign = diffSeconds >= 0 ? "+" : "-";
  if (abs < 60) return `${sign}${Math.round(abs)}s`;
  const mins = Math.floor(abs / 60);
  const secs = Math.round(abs % 60);
  return `${sign}${mins}:${String(secs).padStart(2, "0")}`;
}

function timeToMinLocal(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function calculatePerformancePrediction(
  meet: MeetForPrediction,
  sleepLogs: SleepLogForPrediction[],
  user: UserForPrediction,
): PerformancePrediction | null {
  if (!meet.primaryEvent) return null;
  const referenceTimeStr = meet.recentBest ?? meet.personalBest;
  if (!referenceTimeStr) return null;
  const referenceTime = parseFloat(referenceTimeStr);
  if (isNaN(referenceTime) || referenceTime <= 0) return null;

  const referenceLabel: "PR" | "Season Best" = meet.recentBest ? "Season Best" : "PR";
  const unit = meet.personalBestUnit ?? "mmss";

  const meetDate = new Date(meet.date);
  meetDate.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 10 nights before the meet (night 10 = D-10, night 1 = D-1)
  const nights: { dateStr: string; isPast: boolean }[] = [];
  for (let i = 10; i >= 1; i--) {
    const d = new Date(meetDate);
    d.setDate(meetDate.getDate() - i);
    d.setHours(0, 0, 0, 0);
    nights.push({ dateStr: d.toISOString().slice(0, 10), isPast: d < today });
  }

  const logMap = new Map<string, SleepLogForPrediction>();
  for (const log of sleepLogs) logMap.set(log.date, log);

  let totalDeficitHours = 0;
  let pastNightsDeficit = 0;
  let confidenceNights = 0;
  let hasEstimated = false;
  let remainingNights = 0;

  for (const { dateStr, isPast } of nights) {
    if (!isPast) {
      remainingNights++;
      continue;
    }
    const log = logMap.get(dateStr);
    if (log) {
      confidenceNights++;
      if (log.hitTarget === true) {
        // deficit = 0
      } else if (log.hitTarget === false && log.actualBedtime && log.recommendedBedtime) {
        let devMin = timeToMinLocal(log.actualBedtime) - timeToMinLocal(log.recommendedBedtime);
        if (devMin < -720) devMin += 1440;
        if (devMin > 720) devMin -= 1440;
        const defH = devMin / 60;
        totalDeficitHours += defH;
        pastNightsDeficit += defH;
      }
    } else {
      hasEstimated = true;
    }
  }

  const totalNights = nights.length;
  const avgDeficitHours = totalNights > 0 ? totalDeficitHours / totalNights : 0;

  const capPct = (d: number) =>
    d > 0 ? Math.min(d * 2, 8) : d < 0 ? Math.max(d * 2, -5) : 0;

  const paceChangePct = capPct(avgDeficitHours);
  const predictedTime = referenceTime * (1 + paceChangePct / 100);
  const timeDifference = predictedTime - referenceTime;

  // Best case: future nights all hit target → past deficit unchanged, future = 0
  const bestCaseAvg = totalNights > 0 ? pastNightsDeficit / totalNights : 0;
  const bestCasePredicted = referenceTime * (1 + capPct(bestCaseAvg) / 100);
  const potentialImprovementSeconds = Math.max(0, predictedTime - bestCasePredicted);

  return {
    event: meet.primaryEvent,
    referenceTime,
    referenceLabel,
    avgDeficitHours,
    paceChangePct,
    predictedTime,
    timeDifference,
    confidenceNights,
    totalNights,
    isEstimated: hasEstimated,
    unit,
    remainingNights,
    potentialImprovementSeconds,
  };
}
