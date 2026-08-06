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

export const TEAM_CONSENT_VERSION = "2026-08-06.1";

export const TEAM_CONSENT_TEXT = [
  "I'm joining this team's roster on PRform, and I understand what my coach can and cannot see:",
  "",
  "My coach CAN see:",
  "• my name, and that I'm on the roster",
  "• a daily readiness color (green / amber / red)",
  "• a weekly count, like \"short on sleep 3 of 5 nights\"",
  "• a training recommendation based on that color",
  "",
  "My coach CANNOT see:",
  "• my bedtimes, wake times, or hours slept",
  "• my sleep plan, sleep log, or any chart",
  "• my text messages or phone number",
  "• my race PRs, paces, or training data",
  "",
  "Only I can join myself to a team — nobody can add me. I can leave at any",
  "time from the Team page, and leaving removes my status from the coach's",
  "view immediately.",
].join("\n");

/** What the coach-side UI shows a coach about their own visibility. */
export const COACH_VISIBILITY_NOTE =
  "You see readiness, not sleep. Each athlete shows a color, a weekly trend count, and a recommendation — never bedtimes, hours, messages, or paces.";
