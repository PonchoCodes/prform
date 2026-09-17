// Derived athlete status for the team dashboard — the ONLY lens a team owner
// ever gets on an athlete's sleep.
//
// The contract with the consent screen (lib/team/consent.ts) is enforced by
// shape: this module's output contains a color, a trend sentence built from
// counts, and a recommendation. It never contains a clock time, an hours
// value, or anything a bedtime could be reconstructed from. If a field is
// added here, the consent text has to change first.
//
// Pure — nights come in as data, `today` is a parameter, no server imports.

export type AthleteStatusColor = "green" | "amber" | "red";

export interface NightForStatus {
  /** "YYYY-MM-DD" */
  date: string;
  /** Hours actually slept. Null/undefined when not logged. */
  actualSleepHours?: number | null;
  /** The plan's target for that night. Null on rows that predate targets. */
  targetSleepHours?: number | null;
  /** Flagged rows are excluded from scoring — their durations are untrusted. */
  needsReview?: boolean;
}

export interface AthleteStatus {
  color: AthleteStatusColor;
  /** "Short on sleep 3 of 5 nights" — counts only, never times or hours. */
  trend: string;
  /** What the owner should do with today's session. */
  recommendation: string;
  /** True when the athlete belongs on the exception list. */
  flagged: boolean;
}

/**
 * A night is short when it misses its target by at least this much. 45 min
 * sits above self-report noise but below the hour the verdict treats as a
 * deficit — the owner view is meant to flag earlier than the athlete view
 * panics, because the owner's lever (tomorrow's session) needs a day of lead.
 */
export const SHORT_NIGHT_DEFICIT_HOURS = 0.75;

/** Target to assume when an old row has none. Matches the plan's floor. */
export const FALLBACK_TARGET_HOURS = 8;

/**
 * Whether one night counts as short. Exported so the meet view, the session
 * forecast and the team trend all draw the same line the exception list does;
 * three modules with three thresholds would flag three different athletes.
 */
export function isShortNight(night: NightForStatus): boolean {
  if (night.needsReview || night.actualSleepHours == null) return false;
  const target = night.targetSleepHours ?? FALLBACK_TARGET_HOURS;
  return target - night.actualSleepHours >= SHORT_NIGHT_DEFICIT_HOURS;
}

/** How many scoreable nights before "no data" stops being the story. */
const MIN_NIGHTS_FOR_SIGNAL = 3;

export function deriveAthleteStatus(nights: NightForStatus[], windowDays = 7): AthleteStatus {
  // Most recent window only; callers may pass more history than needed.
  const scoreable = nights
    .filter((n) => !n.needsReview && n.actualSleepHours != null)
    .slice(-windowDays);

  if (scoreable.length === 0) {
    return {
      color: "amber",
      trend: `No sleep logged in the last ${windowDays} days`,
      recommendation:
        "No signal is a signal. Until they log, treat hard sessions as optional.",
      flagged: true,
    };
  }

  let short = 0;
  for (const night of scoreable) {
    if (isShortNight(night)) short++;
  }

  const logged = scoreable.length;
  const trendShort = `Short on sleep ${short} of ${logged} night${logged === 1 ? "" : "s"}`;
  const trendOn = `On target ${logged - short} of ${logged} night${logged === 1 ? "" : "s"}`;

  // Not enough nights to call a pattern either way: only flag when what
  // little exists is bad.
  if (logged < MIN_NIGHTS_FOR_SIGNAL) {
    if (short >= 2) {
      return {
        color: "red",
        trend: trendShort,
        recommendation: "Pull today's intensity. Aerobic volume only until a full night lands.",
        flagged: true,
      };
    }
    return {
      color: "green",
      trend: `${trendOn} (few nights logged)`,
      recommendation: "Train as planned.",
      flagged: false,
    };
  }

  if (short >= 3 || short / logged >= 0.6) {
    return {
      color: "red",
      trend: trendShort,
      recommendation:
        "Move the next hard session. On this pattern it costs more than it returns. Aerobic work only today.",
      flagged: true,
    };
  }

  if (short === 2) {
    return {
      color: "amber",
      trend: trendShort,
      recommendation:
        "Run today as planned, but tonight decides tomorrow. A third short night should move the next quality session.",
      flagged: true,
    };
  }

  return {
    color: "green",
    trend: trendOn,
    recommendation: "Train as planned.",
    flagged: false,
  };
}
