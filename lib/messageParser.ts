// What an athlete's text message means. Pure, deterministic, no model call.
//
// A language model here would be worse in every dimension that matters: it
// would be slower than the webhook budget allows, it would cost money per
// inbound, it would occasionally invent a wake time that was never sent, and it
// could not be tested exhaustively. The vocabulary is a dozen intents and a
// handful of time formats. That is a table, not a reasoning problem.
//
// The rule the whole file is built around: when nothing matches, say so. An
// UNPARSED result costs one clarifying text. A wrong guess writes a fabricated
// number into someone's sleep record and then draws it on a chart.
//
// No server imports, so this is safe in client components.

export type ParsedMessage =
  | { intent: "STOP" }
  | { intent: "HELP" }
  | { intent: "BED" }
  | { intent: "UP" }
  /** A clock time, normalized to "HH:MM" 24h. */
  | { intent: "WAKE_TIME"; clock: string }
  /** A span of sleep, in minutes. */
  | { intent: "DURATION"; minutes: number }
  | { intent: "UNPARSED" };

/**
 * What the app last asked. A bare "11" means 11:00 in answer to "what time are
 * you up?" and 23:00 in answer to "what time did you get down?", and there is
 * no context-free reading that gets both right.
 *
 * Both conventions are echoed back to the athlete in the reply, so a
 * misreading is visible in the thread rather than silent in the database.
 */
export type ParseContext = "wake_time" | "bed_time";

export interface ParseOptions {
  expecting?: ParseContext;
}

// ── normalization ────────────────────────────────────────────────────────────

/**
 * Lower-cases, collapses whitespace, and strips leading/trailing punctuation
 * and emoji. "Bed!! 👍" and "bed" are the same message.
 */
function normalize(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    // Trims to the first and last alphanumeric character. Deliberately ASCII:
    // Unicode property escapes need an ES6 regex target the project does not
    // set, and every token this parser understands is ASCII anyway. A message
    // written entirely in another script reduces to empty and is reported
    // UNPARSED, which is the correct answer rather than a silent misreading.
    .replace(/^[^a-z0-9]+/, "")
    .replace(/[^a-z0-9]+$/, "")
    .trim();
}

/** Hyphens and underscores flattened, for keyword comparison only. */
function keywordForm(text: string): string {
  return text.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
}

function wordCount(text: string): number {
  return text.length === 0 ? 0 : text.split(" ").length;
}

// ── keyword tables ───────────────────────────────────────────────────────────

/** The carrier-standard opt-out keywords, plus the ones people actually type. */
const STOP_WORDS = new Set([
  "stop",
  "stopall",
  "stop all",
  "unsubscribe",
  "cancel",
  "end",
  "quit",
  "revoke",
  "optout",
  "opt out",
]);

const HELP_WORDS = new Set(["help", "info"]);

const BED_PHRASES = new Set([
  "bed",
  "bedtime",
  "in bed",
  "im in bed",
  "i'm in bed",
  "in bed now",
  "going to bed",
  "off to bed",
  "going bed",
  "just got in bed",
  "getting in bed",
  "down",
  "im down",
  "i'm down",
  "lights out",
  "lightsout",
  "asleep",
  "night",
  "goodnight",
  "good night",
  "gn",
]);

const UP_PHRASES = new Set([
  "up",
  "im up",
  "i'm up",
  "up now",
  "awake",
  "im awake",
  "i'm awake",
  "wide awake",
  "got up",
  "just got up",
  "morning",
  "good morning",
  "gm",
]);

const WORD_NUMBERS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  midnight: 0,
  noon: 12,
  midday: 12,
};

/**
 * Hedges and lead-ins that carry no information. Stripped repeatedly, so
 * "i'll be up at about 5:30" reduces to "5:30".
 */
const FILLER_PREFIXES = [
  "i'll be up at",
  "ill be up at",
  "i'll be up",
  "ill be up",
  "i'm up at",
  "im up at",
  "i get up at",
  "getting up at",
  "gonna get up at",
  "gotta be up at",
  "have to be up at",
  "need to be up at",
  "wake up at",
  "waking up at",
  "wake at",
  "up at",
  "i went to bed at",
  "went to bed at",
  "got in bed at",
  "got down at",
  "i slept",
  "slept",
  "about",
  "around",
  "approximately",
  "approx",
  "roughly",
  "maybe",
  "probably",
  "prob",
  "like",
  "say",
  "at",
  "it was",
  "was",
];

const FILLER_SUFFIXES = ["ish", "or so", "or thereabouts", "i think", "thereabouts"];

function stripFiller(text: string): string {
  let out = text;
  let changed = true;
  while (changed) {
    changed = false;
    for (const prefix of FILLER_PREFIXES) {
      if (out === prefix) continue;
      if (out.startsWith(prefix + " ")) {
        out = out.slice(prefix.length + 1).trim();
        changed = true;
      }
    }
    for (const suffix of FILLER_SUFFIXES) {
      if (out.endsWith(" " + suffix)) {
        out = out.slice(0, -(suffix.length + 1)).trim();
        changed = true;
      }
    }
    // "5:30ish" — attached, so it needs its own pass.
    if (/\dish$/.test(out)) {
      out = out.slice(0, -3).trim();
      changed = true;
    }
  }
  return out;
}

// ── time ─────────────────────────────────────────────────────────────────────

type Meridiem = "am" | "pm" | null;

function clockString(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/**
 * Resolves an hour that carried no am/pm marker.
 *
 * Answering "what time are you up?", 1–11 is morning — nobody sets a 7pm alarm
 * and calls it getting up. Answering "what time did you get down?", 6–11 is
 * evening for the same reason, and 12 is midnight rather than noon. Values of
 * 13 and above are already unambiguous.
 */
function resolveBareHour(hour: number, context: ParseContext): number | null {
  if (hour > 23) return null;
  if (hour >= 13) return hour;

  if (context === "wake_time") {
    if (hour === 12) return 12; // noon
    return hour; // 0–11 read as morning, which is what they already are
  }

  // bed_time
  if (hour === 12) return 0; // "12" at bedtime is midnight
  if (hour >= 6 && hour <= 11) return hour + 12; // 8 means 20:00
  return hour; // 1–5 stay as the small hours
}

function applyMeridiem(hour: number, meridiem: Meridiem, context: ParseContext): number | null {
  if (hour > 23 || hour < 0) return null;
  if (meridiem === "am") {
    if (hour > 12) return null; // "13am" is not a time
    return hour === 12 ? 0 : hour;
  }
  if (meridiem === "pm") {
    if (hour > 12) return null;
    return hour === 12 ? 12 : hour + 12;
  }
  return resolveBareHour(hour, context);
}

function meridiemFrom(raw: string | undefined): Meridiem {
  if (!raw) return null;
  const letter = raw.replace(/[^apm]/g, "");
  if (letter.startsWith("a")) return "am";
  if (letter.startsWith("p")) return "pm";
  return null;
}

const MERIDIEM = "(a\\.?m\\.?|p\\.?m\\.?|a|p)";

/** Parses one already-normalized, filler-stripped token as a clock time. */
function parseClock(text: string, context: ParseContext): string | null {
  // 5:30, 5.30, 05:30, with or without am/pm
  const withMinutes = new RegExp(`^(\\d{1,2})[:.](\\d{2})\\s*${MERIDIEM}?$`).exec(text);
  if (withMinutes) {
    const minute = Number(withMinutes[2]);
    if (minute > 59) return null;
    const hour = applyMeridiem(Number(withMinutes[1]), meridiemFrom(withMinutes[3]), context);
    return hour === null ? null : clockString(hour, minute);
  }

  // 5am, 5 pm, 11p
  const hourMeridiem = new RegExp(`^(\\d{1,2})\\s*${MERIDIEM}$`).exec(text);
  if (hourMeridiem) {
    const hour = applyMeridiem(Number(hourMeridiem[1]), meridiemFrom(hourMeridiem[2]), context);
    return hour === null ? null : clockString(hour, 0);
  }

  // 530, 0530, 1745 — hour and minutes run together
  const digitsOnly = new RegExp(`^(\\d{3,4})\\s*${MERIDIEM}?$`).exec(text);
  if (digitsOnly) {
    const digits = digitsOnly[1];
    const hour = Number(digits.slice(0, digits.length - 2));
    const minute = Number(digits.slice(-2));
    if (minute > 59) return null;
    const resolved = applyMeridiem(hour, meridiemFrom(digitsOnly[2]), context);
    return resolved === null ? null : clockString(resolved, minute);
  }

  // A bare number: 5, 11, 23
  const bare = /^(\d{1,2})$/.exec(text);
  if (bare) {
    const hour = resolveBareHour(Number(bare[1]), context);
    return hour === null ? null : clockString(hour, 0);
  }

  // "half 5" — British for 5:30, not half past four. "half past five" too.
  const half = /^half\s*(?:past\s*)?([a-z]+|\d{1,2})$/.exec(text);
  if (half) {
    const hour = numberFromToken(half[1]);
    if (hour === null) return null;
    const resolved = resolveBareHour(hour, context);
    return resolved === null ? null : clockString(resolved, 30);
  }

  // "quarter past 6" / "quarter to 6"
  const quarter = /^(?:a\s*)?quarter\s*(past|to|after|til|till)\s*([a-z]+|\d{1,2})$/.exec(text);
  if (quarter) {
    const hour = numberFromToken(quarter[2]);
    if (hour === null) return null;
    const past = quarter[1] === "past" || quarter[1] === "after";
    const baseHour = past ? hour : (hour + 23) % 24;
    const resolved = resolveBareHour(baseHour, context);
    return resolved === null ? null : clockString(resolved, past ? 15 : 45);
  }

  // "five thirty", "seven o'clock"
  const worded = /^([a-z]+)(?:\s+(thirty|fifteen|forty five|o'? ?clock))?$/.exec(text);
  if (worded) {
    const hour = numberFromToken(worded[1]);
    if (hour !== null) {
      const minute =
        worded[2] === "thirty" ? 30 : worded[2] === "fifteen" ? 15 : worded[2] === "forty five" ? 45 : 0;
      const resolved = resolveBareHour(hour, context);
      return resolved === null ? null : clockString(resolved, minute);
    }
  }

  return null;
}

function numberFromToken(token: string): number | null {
  if (/^\d{1,2}$/.test(token)) {
    const n = Number(token);
    return n <= 23 ? n : null;
  }
  const word = WORD_NUMBERS[token];
  return word === undefined ? null : word;
}

// ── duration ─────────────────────────────────────────────────────────────────

const HOUR_UNIT = "(?:h|hr|hrs|hour|hours)";
const MINUTE_UNIT = "(?:m|min|mins|minute|minutes)";

/**
 * Parses a span of sleep into minutes. Anything from 1 minute to 24 hours is
 * accepted — deciding whether 18 hours is plausible belongs to the guards, not
 * here. The parser's job is to report faithfully what was written.
 */
function parseDuration(text: string): number | null {
  // "7h30", "7 hrs 30 mins", "7h30m"
  const hoursAndMinutes = new RegExp(
    `^(\\d{1,2})\\s*${HOUR_UNIT}\\s*(\\d{1,2})\\s*${MINUTE_UNIT}?$`,
  ).exec(text);
  if (hoursAndMinutes) {
    const minutes = Number(hoursAndMinutes[2]);
    if (minutes > 59) return null;
    return bounded(Number(hoursAndMinutes[1]) * 60 + minutes);
  }

  // "7 and a half hours"
  const andAHalf = new RegExp(`^([a-z]+|\\d{1,2})\\s*(?:and\\s*a\\s*half)\\s*${HOUR_UNIT}$`).exec(text);
  if (andAHalf) {
    const hours = numberFromToken(andAHalf[1]);
    return hours === null ? null : bounded(hours * 60 + 30);
  }

  // "7 hours", "7.5 hours", "7hrs", "seven hours"
  const plain = new RegExp(`^([a-z]+|\\d{1,2}(?:[.,]\\d{1,2})?)\\s*${HOUR_UNIT}$`).exec(text);
  if (plain) {
    const token = plain[1];
    if (/^\d/.test(token)) {
      const hours = Number(token.replace(",", "."));
      if (!Number.isFinite(hours)) return null;
      return bounded(Math.round(hours * 60));
    }
    const hours = numberFromToken(token);
    return hours === null ? null : bounded(hours * 60);
  }

  // "90 minutes" — unusual for a night, but unambiguous when written.
  const minutesOnly = new RegExp(`^(\\d{1,4})\\s*${MINUTE_UNIT}$`).exec(text);
  if (minutesOnly) return bounded(Number(minutesOnly[1]));

  return null;
}

function bounded(minutes: number): number | null {
  if (!Number.isFinite(minutes)) return null;
  if (minutes < 1 || minutes > 24 * 60) return null;
  return minutes;
}

// ── the parser ───────────────────────────────────────────────────────────────

/**
 * Order is the contract. STOP and HELP are resolved before anything else and
 * can never be shadowed by a later branch, because failing to honour an opt-out
 * is the one mistake that gets a sending number blocked outright.
 */
export function parseMessage(raw: string, options: ParseOptions = {}): ParsedMessage {
  const context = options.expecting ?? "wake_time";
  const text = normalize(raw ?? "");
  if (text.length === 0) return { intent: "UNPARSED" };

  const keyword = keywordForm(text);

  if (STOP_WORDS.has(keyword)) return { intent: "STOP" };
  // "please stop", "stop texting me" — an opt-out buried in a short sentence is
  // still an opt-out. Erring toward honouring it costs a user who can re-enrol;
  // erring the other way costs a carrier complaint.
  if (wordCount(keyword) <= 5 && /\b(stop|unsubscribe|opt out)\b/.test(keyword)) {
    return { intent: "STOP" };
  }

  if (HELP_WORDS.has(keyword)) return { intent: "HELP" };

  if (BED_PHRASES.has(keyword)) return { intent: "BED" };
  if (UP_PHRASES.has(keyword)) return { intent: "UP" };

  const stripped = stripFiller(keyword);
  if (stripped.length === 0) return { intent: "UNPARSED" };

  // Re-checked after stripping, so "i'm in bed about now" and "ok bed" land.
  if (BED_PHRASES.has(stripped)) return { intent: "BED" };
  if (UP_PHRASES.has(stripped)) return { intent: "UP" };

  // Duration before time: "7 hours" carries a unit and is unambiguous, while a
  // bare "7" is a clock reading.
  const minutes = parseDuration(stripped);
  if (minutes !== null) return { intent: "DURATION", minutes };

  const clock = parseClock(stripped, context);
  if (clock !== null) return { intent: "WAKE_TIME", clock };

  return { intent: "UNPARSED" };
}
