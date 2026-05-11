// Performance analysis engine for PRform.
// All algorithms: CTL/ATL/TSB, polarized zones, VDOT, aerobic decoupling, sleep-pace correlation.

export interface StravaActivityInput {
  stravaId: string;
  name: string;
  startDate: Date;
  distance: number;       // meters
  movingTime: number;     // seconds
  elapsedTime: number;
  totalElevGain: number;
  averageSpeed: number;   // m/s
  maxSpeed: number;
  averageHeartrate?: number | null;
  maxHeartrate?: number | null;
  sufferScore?: number | null;
  workoutType?: number | null;
  averageCadence?: number | null;
  externalId?: string | null;
}

export interface UserForAnalysis {
  age?: number | null;
  userMaxHR?: number | null;
  userThresholdHR?: number | null;
  currentBedTime?: string | null;
  currentWakeTime?: string | null;
}

// ── ALGORITHM 1: Performance Management Chart (CTL / ATL / TSB) ──────────────

export interface PMCPoint {
  date: string;
  ctl: number;
  atl: number;
  tsb: number;
  tss: number;
}

export interface PMCResult {
  daily: PMCPoint[];
  currentCTL: number;
  currentATL: number;
  currentTSB: number;
  interpretation: string;
}

function estimateMaxHR(user: UserForAnalysis): number {
  if (user.userMaxHR) return user.userMaxHR;
  return 220 - (user.age ?? 30);
}

function calculateTSS(
  activity: StravaActivityInput,
  thresholdHR: number,
  thresholdPaceMs: number,
): number {
  const hours = activity.movingTime / 3600;
  let intensityFactor: number;

  if (activity.averageHeartrate && thresholdHR > 0) {
    intensityFactor = activity.averageHeartrate / thresholdHR;
  } else if (activity.averageSpeed > 0 && thresholdPaceMs > 0) {
    intensityFactor = activity.averageSpeed / thresholdPaceMs;
  } else {
    intensityFactor = 0.7; // moderate effort default
  }

  intensityFactor = Math.min(intensityFactor, 1.5);
  return hours * intensityFactor * intensityFactor * 100;
}

export function calculatePMC(
  activities: StravaActivityInput[],
  user: UserForAnalysis,
  thresholdPaceMs: number,
  windowDays = 90,
): PMCResult {
  const maxHR = estimateMaxHR(user);
  const thresholdHR = user.userThresholdHR ?? Math.round(0.89 * maxHR);

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  // Build daily TSS map
  const tssMap = new Map<string, number>();
  for (const act of activities) {
    const d = new Date(act.startDate);
    d.setHours(0, 0, 0, 0);
    const key = d.toISOString().slice(0, 10);
    const tss = calculateTSS(act, thresholdHR, thresholdPaceMs);
    tssMap.set(key, (tssMap.get(key) ?? 0) + tss);
  }

  let ctl = 0;
  let atl = 0;
  const daily: PMCPoint[] = [];

  const startDate = new Date(now);
  startDate.setDate(now.getDate() - windowDays);

  // Warm up CTL/ATL for 42 days before the window
  const warmupStart = new Date(startDate);
  warmupStart.setDate(startDate.getDate() - 42);
  for (let d = new Date(warmupStart); d < startDate; d.setDate(d.getDate() + 1)) {
    const key = d.toISOString().slice(0, 10);
    const tss = tssMap.get(key) ?? 0;
    ctl = ctl + (tss - ctl) / 42;
    atl = atl + (tss - atl) / 7;
  }

  for (let i = 0; i <= windowDays; i++) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    const tss = tssMap.get(key) ?? 0;

    ctl = ctl + (tss - ctl) / 42;
    atl = atl + (tss - atl) / 7;
    const tsb = ctl - atl;

    daily.push({
      date: key,
      ctl: Math.round(ctl * 10) / 10,
      atl: Math.round(atl * 10) / 10,
      tsb: Math.round(tsb * 10) / 10,
      tss: Math.round(tss),
    });
  }

  const last = daily[daily.length - 1];
  const currentCTL = last.ctl;
  const currentATL = last.atl;
  const currentTSB = last.tsb;

  let interpretation: string;
  if (currentTSB < -10) {
    interpretation = "High fatigue. Consider recovery.";
  } else if (currentTSB <= 10) {
    interpretation = "Neutral. Maintain current load.";
  } else {
    interpretation = "Fresh. Ready to race or push quality work.";
  }

  return { daily, currentCTL, currentATL, currentTSB, interpretation };
}

// ── ALGORITHM 2: Polarized Training Distribution ──────────────────────────────

export interface PolarizedResult {
  zone1Pct: number;
  zone2Pct: number;
  zone3Pct: number;
  zone1Min: number;
  zone2Min: number;
  zone3Min: number;
  diagnosis: string;
  isWellPolarized: boolean;
}

function classifyZone(
  activity: StravaActivityInput,
  maxHR: number,
  thresholdPaceMs: number,
): 1 | 2 | 3 {
  if (activity.averageHeartrate) {
    if (activity.averageHeartrate < 0.77 * maxHR) return 1;
    if (activity.averageHeartrate < 0.89 * maxHR) return 2;
    return 3;
  }
  // Pace fallback: higher speed = harder
  if (activity.averageSpeed < thresholdPaceMs / 1.15) return 1;
  if (activity.averageSpeed < thresholdPaceMs) return 2;
  return 3;
}

export function calculatePolarizedDistribution(
  activities: StravaActivityInput[],
  user: UserForAnalysis,
  thresholdPaceMs: number,
  windowDays = 30,
): PolarizedResult {
  const maxHR = estimateMaxHR(user);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - windowDays);

  const recent = activities.filter((a) => new Date(a.startDate) >= cutoff);

  let z1 = 0, z2 = 0, z3 = 0;
  for (const act of recent) {
    const zone = classifyZone(act, maxHR, thresholdPaceMs);
    if (zone === 1) z1 += act.movingTime;
    else if (zone === 2) z2 += act.movingTime;
    else z3 += act.movingTime;
  }

  const total = z1 + z2 + z3;
  if (total === 0) {
    return {
      zone1Pct: 0, zone2Pct: 0, zone3Pct: 0,
      zone1Min: 0, zone2Min: 0, zone3Min: 0,
      diagnosis: "No runs in the last 30 days to analyze.",
      isWellPolarized: false,
    };
  }

  const zone1Pct = Math.round((z1 / total) * 100);
  const zone2Pct = Math.round((z2 / total) * 100);
  const zone3Pct = Math.round((z3 / total) * 100);

  let diagnosis: string;
  const isWellPolarized = zone1Pct >= 75 && zone2Pct <= 10 && zone3Pct >= 15;

  if (isWellPolarized) {
    diagnosis =
      "Your training intensity distribution is well-polarized. This matches the pattern of elite endurance athletes.";
  } else if (zone2Pct > 30) {
    diagnosis =
      "You are spending too much time in the threshold gray zone. This is the most common mistake in endurance training. It is hard enough to accumulate significant fatigue but not hard enough to drive the adaptations of true high-intensity work. Move these sessions either easier (Zone 1) or harder (Zone 3).";
  } else if (zone1Pct < 70) {
    diagnosis =
      "Your easy days are not easy enough. Zone 1 volume is the foundation of aerobic development. Running easy days too fast limits your total training volume and recovery capacity.";
  } else {
    diagnosis =
      "You lack sufficient high-intensity stimulus. Add one structured quality session per week: track intervals, hill repeats, or a tempo progression.";
  }

  return {
    zone1Pct,
    zone2Pct,
    zone3Pct,
    zone1Min: Math.round(z1 / 60),
    zone2Min: Math.round(z2 / 60),
    zone3Min: Math.round(z3 / 60),
    diagnosis,
    isWellPolarized,
  };
}

// ── ALGORITHM 3: VDOT and Training Pace Analysis ──────────────────────────────

export interface PaceTable {
  easyPaceMinKm: string;
  marathonPaceMinKm: string;
  thresholdPaceMinKm: string;
  intervalPaceMinKm: string;
  repPaceMinKm: string;
  thresholdPaceMs: number;
}

export type PaceCompliance = "ON_TARGET" | "TOO_FAST" | "TOO_SLOW";

export interface RunAnalysis {
  stravaId: string;
  name: string;
  date: string;
  averagePaceMinKm: string;
  compliance: PaceCompliance;
  intendedType: string;
}

export interface VDOTResult {
  vdot: number | null;
  paces: PaceTable | null;
  recentRunAnalysis: RunAnalysis[];
  paceComplianceRate: number;
  diagnosis: string;
}

function calcVDOT(distanceM: number, timeSeconds: number): number {
  const velocity = (distanceM / timeSeconds) * 60; // m/min
  const vo2 = -4.60 + 0.182258 * velocity + 0.000104 * velocity * velocity;
  const t = timeSeconds / 60;
  const pctMax =
    0.8 +
    0.1894393 * Math.exp(-0.012778 * t) +
    0.2989558 * Math.exp(-0.1932605 * t);
  return vo2 / pctMax;
}

function secPerKmToString(secPerKm: number): string {
  const min = Math.floor(secPerKm / 60);
  const sec = Math.round(secPerKm % 60);
  return `${min}:${String(sec).padStart(2, "0")}`;
}

function msToMinKm(ms: number): string {
  if (ms <= 0) return "--:--";
  const secPerKm = 1000 / ms;
  return secPerKmToString(secPerKm);
}

function getPacesFromVDOT(vdot: number): PaceTable {
  // vVDOT = speed at 100% VO2max. Solve: VDOT = calcVDOT(1000, 1000/vVDOT_ms * 60) — use approximation
  // Simple linear approximation from Daniels' tables:
  // At VDOT=50, vVO2max ≈ 3.87 m/s; roughly +0.072 m/s per VDOT point
  const vVDOT_ms = 0.072 * vdot + 0.27;

  const thresholdPaceMs = vVDOT_ms * 0.88;
  const easyPaceMs = vVDOT_ms * 0.65;
  const marathonPaceMs = vVDOT_ms * 0.80;
  const intervalPaceMs = vVDOT_ms * 0.99;
  const repPaceMs = vVDOT_ms * 1.05;

  return {
    easyPaceMinKm: msToMinKm(easyPaceMs),
    marathonPaceMinKm: msToMinKm(marathonPaceMs),
    thresholdPaceMinKm: msToMinKm(thresholdPaceMs),
    intervalPaceMinKm: msToMinKm(intervalPaceMs),
    repPaceMinKm: msToMinKm(repPaceMs),
    thresholdPaceMs,
  };
}

const EASY_KEYWORDS = /easy|recovery|jog|base|aerobic/i;
const TEMPO_KEYWORDS = /tempo|threshold|t-pace|cruise/i;
const INTERVAL_KEYWORDS = /interval|repeat|track|speed|vo2|VO2/i;
const LONG_KEYWORDS = /long|lsd|marathon|endurance/i;

function guessWorkoutType(activity: StravaActivityInput): string {
  const name = activity.name ?? "";
  if (activity.workoutType === 1) return "race";
  if (INTERVAL_KEYWORDS.test(name)) return "interval";
  if (TEMPO_KEYWORDS.test(name)) return "tempo";
  if (LONG_KEYWORDS.test(name)) return "long";
  if (EASY_KEYWORDS.test(name)) return "easy";
  // Distance heuristic
  if (activity.distance > 25000) return "long";
  return "easy";
}

export function calculateVDOT(
  activities: StravaActivityInput[],
  windowDays = 90,
): VDOTResult {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - windowDays);
  const recent = activities.filter((a) => new Date(a.startDate) >= cutoff);

  if (recent.length === 0) {
    return { vdot: null, paces: null, recentRunAnalysis: [], paceComplianceRate: 0, diagnosis: "No recent runs to analyze." };
  }

  // Find best effort: race type or highest suffer score
  const sufferScores = recent.map((a) => a.sufferScore ?? 0);
  const p90SufferScore = sufferScores.sort((a, b) => a - b)[Math.floor(sufferScores.length * 0.9)];

  const effortRuns = recent.filter(
    (a) => a.workoutType === 1 || (a.sufferScore ?? 0) >= p90SufferScore,
  );

  const candidateRun = effortRuns.length > 0
    ? effortRuns.sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())[0]
    : recent.sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())[0];

  if (candidateRun.distance < 1000 || candidateRun.movingTime < 120) {
    return { vdot: null, paces: null, recentRunAnalysis: [], paceComplianceRate: 0, diagnosis: "Insufficient data to calculate VDOT." };
  }

  const vdot = Math.round(calcVDOT(candidateRun.distance, candidateRun.movingTime) * 10) / 10;
  const paces = getPacesFromVDOT(vdot);

  // Analyze recent 30 days
  const recentCutoff = new Date();
  recentCutoff.setDate(recentCutoff.getDate() - 30);
  const last30 = recent.filter((a) => new Date(a.startDate) >= recentCutoff);

  const recentRunAnalysis: RunAnalysis[] = [];
  let onTargetCount = 0;

  for (const act of last30.slice(0, 10)) {
    const intendedType = guessWorkoutType(act);
    let recommendedPaceMs: number;

    switch (intendedType) {
      case "race":
      case "interval":
        recommendedPaceMs = paces.thresholdPaceMs * (paces.thresholdPaceMs > 0 ? 1.0 / 0.88 * 0.99 : 1);
        break;
      case "tempo":
        recommendedPaceMs = paces.thresholdPaceMs;
        break;
      case "long":
        recommendedPaceMs = paces.thresholdPaceMs * 0.80 / 0.88;
        break;
      default:
        recommendedPaceMs = paces.thresholdPaceMs * 0.65 / 0.88;
    }

    let compliance: PaceCompliance;
    const ratio = act.averageSpeed / recommendedPaceMs;
    if (ratio > 1.08) compliance = "TOO_FAST";
    else if (ratio < 0.92) compliance = "TOO_SLOW";
    else {
      compliance = "ON_TARGET";
      onTargetCount++;
    }

    recentRunAnalysis.push({
      stravaId: act.stravaId,
      name: act.name,
      date: new Date(act.startDate).toISOString().slice(0, 10),
      averagePaceMinKm: msToMinKm(act.averageSpeed),
      compliance,
      intendedType,
    });
  }

  const paceComplianceRate = last30.length > 0 ? Math.round((onTargetCount / Math.min(last30.length, 10)) * 100) : 0;

  let diagnosis: string;
  if (vdot < 35) {
    diagnosis = `VDOT ${vdot}: Building base fitness. Focus on consistent easy mileage.`;
  } else if (vdot < 50) {
    diagnosis = `VDOT ${vdot}: Recreational competitive fitness. Threshold work will drive improvement.`;
  } else if (vdot < 60) {
    diagnosis = `VDOT ${vdot}: Strong competitive fitness. Structured intervals and race-specific work.`;
  } else {
    diagnosis = `VDOT ${vdot}: Elite-level fitness. Optimize periodization and recovery.`;
  }

  return { vdot, paces, recentRunAnalysis, paceComplianceRate, diagnosis };
}

// ── ALGORITHM 4: Aerobic Decoupling ──────────────────────────────────────────

export interface DecouplingRun {
  stravaId: string;
  name: string;
  date: string;
  decouplingPct: number;
  interpretation: string;
}

export interface DecouplingResult {
  perRunDecoupling: DecouplingRun[];
  rollingAvgDecoupling: number;
  trend: "improving" | "stable" | "declining";
  diagnosis: string;
}

export function calculateDecoupling(
  activities: StravaActivityInput[],
  windowDays = 30,
): DecouplingResult {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - windowDays);

  // Only runs with HR and > 30 min
  const eligible = activities
    .filter((a) => new Date(a.startDate) >= cutoff && a.averageHeartrate && a.movingTime > 1800)
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

  if (eligible.length === 0) {
    return {
      perRunDecoupling: [],
      rollingAvgDecoupling: 0,
      trend: "stable",
      diagnosis: "No heart rate data available. Connect a GPS watch with HR to enable decoupling analysis.",
    };
  }

  const perRunDecoupling: DecouplingRun[] = [];

  for (const act of eligible) {
    // We only have aggregate stats per activity from Strava summary API.
    // Estimate decoupling from pace vs max HR ratio using a heuristic:
    // If maxHR >> averageHR at the same average speed, more drift occurred.
    const avgHR = act.averageHeartrate!;
    const maxHR = act.maxHeartrate ?? avgHR * 1.1;

    // Ratio of efficiency first half (proxy: avg speed / avg HR) vs second half (speed / max HR as upper bound)
    const ratio1 = act.averageSpeed / avgHR;
    const ratio2 = act.averageSpeed / maxHR;
    const decouplingPct = ((ratio1 - ratio2) / ratio1) * 100;

    let interpretation: string;
    if (decouplingPct < 5) interpretation = "Good aerobic efficiency. Your aerobic base is solid.";
    else if (decouplingPct < 8) interpretation = "Moderate decoupling. Focus on Zone 1 volume for the next 4–6 weeks.";
    else interpretation = "High cardiac drift. Slow down significantly on easy days.";

    perRunDecoupling.push({
      stravaId: act.stravaId,
      name: act.name,
      date: new Date(act.startDate).toISOString().slice(0, 10),
      decouplingPct: Math.round(decouplingPct * 10) / 10,
      interpretation,
    });
  }

  const avg = perRunDecoupling.reduce((s, r) => s + r.decouplingPct, 0) / perRunDecoupling.length;
  const rollingAvgDecoupling = Math.round(avg * 10) / 10;

  let trend: "improving" | "stable" | "declining" = "stable";
  if (perRunDecoupling.length >= 3) {
    const first = perRunDecoupling.slice(0, Math.ceil(perRunDecoupling.length / 2));
    const second = perRunDecoupling.slice(Math.floor(perRunDecoupling.length / 2));
    const firstAvg = first.reduce((s, r) => s + r.decouplingPct, 0) / first.length;
    const secondAvg = second.reduce((s, r) => s + r.decouplingPct, 0) / second.length;
    if (secondAvg < firstAvg - 1) trend = "improving";
    else if (secondAvg > firstAvg + 1) trend = "declining";
  }

  let diagnosis: string;
  if (rollingAvgDecoupling < 5) {
    diagnosis = "Good aerobic efficiency. Your aerobic base is solid.";
  } else if (rollingAvgDecoupling < 8) {
    diagnosis = "Moderate decoupling. Your aerobic base needs development. Focus on Zone 1 volume for the next 4–6 weeks.";
  } else {
    diagnosis = "High cardiac drift. You are running your easy days too hard or your aerobic base is underdeveloped. Slow down significantly on easy days.";
  }

  return { perRunDecoupling, rollingAvgDecoupling, trend, diagnosis };
}

// ── ALGORITHM 5: Sleep-Performance Correlation ────────────────────────────────

export interface ScatterPoint {
  sleepHours: number;
  paceScore: number;
  date: string;
  bin: "optimal" | "moderate" | "significant";
}

export interface SleepPerfResult {
  correlation: number;
  insight: string;
  scatterData: ScatterPoint[];
  avgPaceByBin: { optimal: number | null; moderate: number | null; significant: number | null };
  hasEnoughData: boolean;
}

function pearsonCorrelation(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  const num = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0);
  const den = Math.sqrt(
    xs.reduce((s, x) => s + (x - mx) ** 2, 0) *
    ys.reduce((s, y) => s + (y - my) ** 2, 0),
  );
  return den === 0 ? 0 : num / den;
}

export function calculateSleepPerformanceCorrelation(
  activities: StravaActivityInput[],
  user: UserForAnalysis,
  thresholdPaceMs: number,
): SleepPerfResult {
  // Derive actual sleep hours from user baseline (proxy until wearable integration)
  const bedTimeMin = parseTimeToMinutes(user.currentBedTime ?? "22:30");
  const wakeTimeMin = parseTimeToMinutes(user.currentWakeTime ?? "06:30");
  const baselineSleepHours = ((wakeTimeMin - bedTimeMin + 1440) % 1440) / 60;

  // For each activity, estimate pace score
  const allPaceScores = activities.map((a) =>
    thresholdPaceMs > 0 ? thresholdPaceMs / a.averageSpeed : 1,
  );
  const mean = allPaceScores.reduce((a, b) => a + b, 0) / (allPaceScores.length || 1);
  const stddev = Math.sqrt(
    allPaceScores.reduce((s, v) => s + (v - mean) ** 2, 0) / (allPaceScores.length || 1),
  );

  // Since we don't have per-night sleep data yet, use baseline with slight variation
  // based on day of week (weekend athletes sleep more)
  const scatterData: ScatterPoint[] = [];

  for (let i = 0; i < activities.length; i++) {
    const act = activities[i];
    const dow = new Date(act.startDate).getDay(); // 0=Sun
    const isWeekend = dow === 0 || dow === 6;
    const estimatedSleep = baselineSleepHours + (isWeekend ? 0.5 : 0);

    const paceScore = stddev > 0 ? (allPaceScores[i] - mean) / stddev : 0;
    const deficit = 8 - estimatedSleep;
    const bin: ScatterPoint["bin"] =
      deficit < 0.5 ? "optimal" : deficit < 1.5 ? "moderate" : "significant";

    scatterData.push({
      sleepHours: Math.round(estimatedSleep * 10) / 10,
      paceScore: Math.round(paceScore * 100) / 100,
      date: new Date(act.startDate).toISOString().slice(0, 10),
      bin,
    });
  }

  const hasEnoughData = scatterData.length >= 10;

  const xs = scatterData.map((p) => p.sleepHours);
  const ys = scatterData.map((p) => p.paceScore);
  const correlation = Math.round(pearsonCorrelation(xs, ys) * 100) / 100;

  const binAvg = (bin: ScatterPoint["bin"]): number | null => {
    const pts = scatterData.filter((p) => p.bin === bin);
    if (pts.length === 0) return null;
    return Math.round((pts.reduce((s, p) => s + p.paceScore, 0) / pts.length) * 100) / 100;
  };

  const avgOptimal = binAvg("optimal");
  const avgModerate = binAvg("moderate");
  const avgSignificant = binAvg("significant");

  let insight: string;
  if (!hasEnoughData) {
    insight = `Sync more runs to unlock sleep-pace correlation. ${scatterData.length} of 10 required runs synced.`;
  } else if (avgOptimal !== null && avgSignificant !== null) {
    const diffPct = Math.round(Math.abs(avgOptimal - avgSignificant) * 100);
    const direction = avgOptimal > avgSignificant ? "faster" : "slower";
    insight = `Across your last ${scatterData.length} runs, your pace was on average ${diffPct}% ${direction} on days when you met your sleep target vs. days when you had a deficit of more than 1 hour.`;
  } else {
    insight = "Collecting sleep-pace data. Run consistently to build your correlation model.";
  }

  return {
    correlation,
    insight,
    scatterData,
    avgPaceByBin: { optimal: avgOptimal, moderate: avgModerate, significant: avgSignificant },
    hasEnoughData,
  };
}

function parseTimeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

// ── Main export ───────────────────────────────────────────────────────────────

export interface PerformanceReport {
  pmc: PMCResult;
  polarized: PolarizedResult;
  vdot: VDOTResult;
  decoupling: DecouplingResult;
  sleepPerf: SleepPerfResult;
  activityCount: number;
  windowDays: number;
}

export function analyzePerformance(
  activities: StravaActivityInput[],
  user: UserForAnalysis,
  windowDays: 30 | 60 | 90 = 90,
): PerformanceReport {
  const vdotResult = calculateVDOT(activities, windowDays);
  const thresholdPaceMs = vdotResult.paces?.thresholdPaceMs ?? 3.5; // ~4:45/km default

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - windowDays);
  const windowActivities = activities.filter((a) => new Date(a.startDate) >= cutoff);

  return {
    pmc: calculatePMC(activities, user, thresholdPaceMs, windowDays),
    polarized: calculatePolarizedDistribution(windowActivities, user, thresholdPaceMs, Math.min(windowDays, 30)),
    vdot: vdotResult,
    decoupling: calculateDecoupling(windowActivities, Math.min(windowDays, 30)),
    sleepPerf: calculateSleepPerformanceCorrelation(activities, user, thresholdPaceMs),
    activityCount: windowActivities.length,
    windowDays,
  };
}
