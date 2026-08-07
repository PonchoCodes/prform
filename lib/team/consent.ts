// The exact words an athlete agrees to when joining a team, and the only copy
// of them the server will store.
//
// Same construction as the SMS consent (lib/messaging/consent.ts), for the
// same reason: the server writes this constant, never text posted by the
// client, so what was agreed to and what is recorded cannot differ. Stored
// verbatim on the membership row; rewording this file never rewrites a past
// athlete's record.
//
// Every claim in this text is load-bearing. The exceptions endpoint must never
// return more than the text promises — if the endpoint grows a field, this
// text (and the version below) has to change first, not after.
//
// ── Why the version moved to 2026-08-07.1 ───────────────────────────────────
//
// The previous wording said "my coach" throughout. Once anyone can make a team,
// that is often false: the person reading a roster may be a team captain, and
// an athlete told "your coach can see this" about their teammate has been
// misinformed about who is looking. The rewording below says what is actually
// true — the person who runs the team — and names the two kinds of person that
// can be, so nobody has to guess which one applies to them.
//
// Athletes who joined under the old text keep it, verbatim, on their row. That
// is the point of storing it: this edit changes what future joiners agree to
// and nothing about what past ones did.

// ── Why the version moved to 2026-08-07.2 ───────────────────────────────────
//
// The consistency leaderboard is a disclosure to TEAMMATES, and every previous
// version of this text only ever described what the person running the team
// could see. So the text gained a section before the endpoint was written,
// which is the rule at the top of this file being followed rather than quoted.
//
// What teammates get is deliberately the thinnest possible fact: whether you
// checked in, and on how many of the nights that were available to you. Not
// how long you slept, not when, not whether you hit anything. The distinction
// is the entire design of the feature — a leaderboard on sleep duration would
// rank teenagers against each other on a number half of them cannot control,
// and this one ranks them on whether they opened the app.

export const TEAM_CONSENT_VERSION = "2026-08-07.2";

export const TEAM_CONSENT_TEXT = [
  "I'm joining this team's roster on PRform. The person who runs this team, a",
  "coach or a captain who set it up, will be able to see some things about how",
  "I'm sleeping. Here is exactly what:",
  "",
  "They CAN see:",
  "• my name, and that I'm on the roster",
  "• a daily readiness color (green / amber / red)",
  "• a weekly count, like \"short on sleep 3 of 5 nights\"",
  "• a training recommendation based on that color",
  "",
  "They CANNOT see:",
  "• my bedtimes, wake times, or hours slept",
  "• my sleep plan, sleep log, or any chart",
  "• my text messages, notifications, or phone number",
  "• my race PRs, paces, or training data",
  "",
  "My TEAMMATES can see one thing: a weekly check-in board showing how many",
  "nights each of us logged, out of the nights we could have. That is whether",
  "I checked in, not how I slept. Nobody on the team, including whoever runs",
  "it, sees another person's bedtime, wake time or hours. The board starts",
  "over every week.",
  "",
  "Only I can join myself to a team. Nobody can add me. I can leave at any",
  "time from the Team page, and leaving removes my status from their view",
  "and my name from the board immediately.",
].join("\n");

/**
 * What the team-side UI shows an owner about their own visibility.
 *
 * Kept because an owner who expects a sleep dashboard and finds colours will
 * go looking for the rest. It states what they get, and stops there: the list
 * of what they cannot see belongs on the consent screen, where it is a promise
 * being made to the person it concerns, not a boast being made to someone else.
 */
export const OWNER_VISIBILITY_NOTE =
  "You see readiness, not sleep. Each athlete shows a color, a weekly trend count, and a recommendation.";
