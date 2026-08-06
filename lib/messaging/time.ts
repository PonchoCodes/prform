// Local-time arithmetic against IANA timezones, built on Intl. No dependency:
// Node ships full ICU, so every zone identifier resolves.
//
// Nothing here ever stores or computes with a UTC offset. An offset is a
// property of an instant, not of a place — "UTC-5" is true of New York in
// January and false in July, and a stored offset would send someone a
// lights-out text an hour off for half the year. Offsets appear below only as
// intermediate values, always derived from a zone plus an instant.
//
// No server imports, so this is safe in client components.

/** "YYYY-MM-DD" — a local calendar date, never an instant. */
export type LocalDate = string;
/** "HH:MM" 24h — a local wall-clock time, never an instant. */
export type ClockTime = string;

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = formatterCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      // h23 rather than hour12:false — the latter renders midnight as "24" in
      // some locales, which silently shifts the date by a day.
      hourCycle: "h23",
    });
    formatterCache.set(timeZone, f);
  }
  return f;
}

/** True if the string is an IANA zone this runtime can resolve. */
export function isValidTimeZone(timeZone: unknown): timeZone is string {
  if (typeof timeZone !== "string" || timeZone.length === 0) return false;
  // A bare offset is not a timezone, and accepting one would defeat the point
  // of storing IANA identifiers in the first place.
  if (/^[+-]?\d{1,2}(:\d{2})?$/.test(timeZone)) return false;
  if (/^(UTC|GMT)[+-]/i.test(timeZone)) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** The wall-clock reading a person in `timeZone` sees at `instant`. */
function wallClockAt(instant: Date, timeZone: string): WallClock {
  const parts = formatterFor(timeZone).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((p) => p.type === type);
    return part ? Number(part.value) : 0;
  };
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * The zone's offset from UTC at a given instant, in minutes east of UTC.
 * Derived per-instant, never cached against a zone — that is the DST bug.
 */
export function offsetMinutesAt(instant: Date, timeZone: string): number {
  const w = wallClockAt(instant, timeZone);
  const asIfUTC = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  // Milliseconds are not represented in the parts, so compare against a
  // second-truncated instant or the difference picks up sub-second noise.
  const truncated = Math.floor(instant.getTime() / 1000) * 1000;
  return (asIfUTC - truncated) / 60000;
}

/** The athlete's calendar date at `instant`. This is what `localDate` stores. */
export function localDateOf(instant: Date, timeZone: string): LocalDate {
  const w = wallClockAt(instant, timeZone);
  return `${w.year}-${pad2(w.month)}-${pad2(w.day)}`;
}

/** The athlete's wall-clock time at `instant`. */
export function localClockOf(instant: Date, timeZone: string): ClockTime {
  const w = wallClockAt(instant, timeZone);
  return `${pad2(w.hour)}:${pad2(w.minute)}`;
}

export interface ZonedInstant {
  /** The UTC instant the local wall time corresponds to. */
  instant: Date;
  /**
   * False when the requested wall time does not exist in that zone on that
   * date — the hour a spring-forward transition skips. The returned instant is
   * then the requested time shifted forward by the length of the gap, so it is
   * always at or after the time asked for and never an hour before it.
   */
  exact: boolean;
}

/**
 * Converts a local wall time to the instant it names. The inverse of
 * `localDateOf` + `localClockOf`, and the function every scheduling decision
 * ultimately routes through.
 *
 * Two DST edge cases, both handled deterministically rather than left to
 * whichever offset happened to be sampled first:
 *
 *   Gap (spring forward) — 02:30 on a day the clock goes 02:00 → 03:00 never
 *   happens. `exact` comes back false and the instant is the transition point.
 *
 *   Overlap (fall back) — 01:30 on a day the clock goes 02:00 → 01:00 happens
 *   twice. The earlier of the two is returned, so a 01:30 wake-up text arrives
 *   on the first pass rather than an hour into the repeat.
 */
export function instantFromLocal(
  localDate: LocalDate,
  clock: ClockTime,
  timeZone: string,
): ZonedInstant {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDate);
  const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(clock);
  if (!dateMatch || !timeMatch) {
    throw new Error(`instantFromLocal: bad input ${localDate} ${clock}`);
  }
  const [, y, mo, d] = dateMatch;
  const [, hh, mm] = timeMatch;

  const wallAsUTC = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(hh), Number(mm), 0, 0);

  // Two candidates: the offset in force at the same numeric instant, and the
  // offset actually in force at where that lands. Away from a transition they
  // agree. Across one they bracket it, and which of them is right — or whether
  // either is — is exactly what distinguishes a gap from an overlap.
  const offsetA = offsetMinutesAt(new Date(wallAsUTC), timeZone);
  const candidateA = new Date(wallAsUTC - offsetA * 60000);
  const offsetB = offsetMinutesAt(candidateA, timeZone);
  const candidateB = new Date(wallAsUTC - offsetB * 60000);

  const target = `${pad2(Number(hh))}:${mm}`;
  const aRoundTrips = localClockOf(candidateA, timeZone) === target;
  const bRoundTrips = localClockOf(candidateB, timeZone) === target;

  // Both valid: either an ordinary time, where the candidates are identical, or
  // an overlap, where the wall time happens twice. Taking the earlier means a
  // 01:30 text on a fall-back night arrives on the first pass.
  if (aRoundTrips && bRoundTrips) {
    return {
      instant: new Date(Math.min(candidateA.getTime(), candidateB.getTime())),
      exact: true,
    };
  }
  if (aRoundTrips) return { instant: candidateA, exact: true };
  if (bRoundTrips) return { instant: candidateB, exact: true };

  // Neither round-trips, so the wall time is inside a gap. Take the later
  // candidate, which is the requested time pushed past the transition.
  return {
    instant: new Date(Math.max(candidateA.getTime(), candidateB.getTime())),
    exact: false,
  };
}

/** Adds days to a "YYYY-MM-DD" key without going near an instant. */
export function addLocalDays(localDate: LocalDate, days: number): LocalDate {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDate);
  if (!m) throw new Error(`addLocalDays: bad date ${localDate}`);
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  d.setUTCDate(d.getUTCDate() + days);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/** Minutes since local midnight, for "HH:MM". Null when unparseable. */
export function clockToMinutes(clock: unknown): number | null {
  if (typeof clock !== "string") return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(clock.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

/** "HH:MM" from minutes since midnight, wrapping across the day boundary. */
export function minutesToClock(minutes: number): ClockTime {
  const total = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${pad2(Math.floor(total / 60))}:${pad2(total % 60)}`;
}
