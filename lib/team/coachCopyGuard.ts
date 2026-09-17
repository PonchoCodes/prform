// The rule every coach-facing string is held to, stated once.
//
// The consent screen (lib/team/consent.ts) promises an athlete that the person
// running their team never sees a bedtime, a wake time or an hours value. The
// exception list kept that promise by shape: deriveAthleteStatus emits colours
// and counts, and its test asserts the strings carry no clock time and no
// hours. Every later coach-facing module — meet readiness, session forecasts,
// the team trend, the digest, the nudge preview — has to keep the same promise,
// so the check lives here rather than being re-typed in each test with slightly
// different regexes that drift apart.
//
// What is forbidden: anything that reads as a clock time (22:30, 6.5, 9pm), a
// duration in hours (8h, 8 hours, 8hrs) or a duration in minutes. What is
// allowed: counts ("3 of 5 nights"), percentages ("62%"), day counts ("4 days
// out"), and weekday names. A short-night count says an athlete had a bad
// night; an hours value says how bad, and the second is the one that was
// promised away.
//
// Pure, no imports. Used from tests, and from nothing at runtime: this is a
// build-time promise, not a filter that lets a leak through with a warning.

const LEAK_PATTERNS: Array<{ label: string; re: RegExp }> = [
  // "22:30", "6.5", "1:52" — a clock face or a decimal quantity.
  { label: "clock time or decimal", re: /\d+[.:]\d+/ },
  // "8h", "8 h", "8hrs", "8 hr"
  { label: "hours abbreviation", re: /\d+\s*h(?:rs?)?\b/i },
  // "8 hours", "1 hour"
  { label: "hours", re: /\d+\s*hours?\b/i },
  // "45 min", "45 minutes"
  { label: "minutes", re: /\d+\s*min(?:ute)?s?\b/i },
  // "9pm", "9 am", "10 p.m."
  { label: "am/pm time", re: /\b\d{1,2}\s*(?:a\.?m\.?|p\.?m\.?)\b/i },
];

/**
 * Every forbidden value found in `text`, described. Empty when clean.
 *
 * Returns a list rather than a boolean so a failing test names what leaked
 * and from which sentence.
 */
export function findSleepValueLeaks(text: string): string[] {
  const leaks: string[] = [];
  for (const { label, re } of LEAK_PATTERNS) {
    const match = re.exec(text);
    if (match) leaks.push(`${label}: "${match[0]}" in "${text}"`);
  }
  return leaks;
}

/**
 * Payload keys that would carry a sleep value even when every string is clean.
 * A number under `actualSleepHours` is a leak whether or not it is formatted.
 */
const LEAK_KEYS = /hours|bedtime|waketime|wakeat|sleeponset|actualsleep|targetsleep|recommended/i;

/**
 * Walks a JSON-shaped value and reports every string that fails the guard and
 * every key that names a sleep value. This is what an API payload is held to:
 * the strings are checked because that is what the coach reads, and the keys
 * because a field named `actualSleepHours` is a leak regardless of its value.
 */
export function findSleepValueLeaksInPayload(value: unknown, path = "$"): string[] {
  if (typeof value === "string") return findSleepValueLeaks(value).map((l) => `${path}: ${l}`);
  if (Array.isArray(value)) {
    return value.flatMap((v, i) => findSleepValueLeaksInPayload(v, `${path}[${i}]`));
  }
  if (value && typeof value === "object") {
    const leaks: string[] = [];
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      if (LEAK_KEYS.test(key)) leaks.push(`${path}.${key}: key names a sleep value`);
      leaks.push(...findSleepValueLeaksInPayload(v, `${path}.${key}`));
    }
    return leaks;
  }
  return [];
}
