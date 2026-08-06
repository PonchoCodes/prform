// The exact words an athlete agrees to, and the only copy of them the server
// will store.
//
// Held here rather than passed up from the browser on purpose. If the client
// posted the consent text, a modified client could record any wording it liked
// against a real opt-in, and the stored record would look identical to a
// genuine one. The UI renders this constant and the server writes this
// constant; the two cannot disagree because there is only one.
//
// Editing the wording is a real change. Past opt-ins keep the text they were
// given, because `smsOptInText` is a copy taken at the time rather than a
// pointer to whatever this file says today — which is the whole reason it is a
// column and not a lookup.

/**
 * Bumped whenever CONSENT_TEXT changes materially, so a stored record can be
 * traced to the wording that produced it even if the string is later reworded.
 */
export const SMS_CONSENT_VERSION = "2026-08-06.1";

/**
 * Carrier guidance expects the message frequency, the cost disclosure, the
 * opt-out instruction and the help keyword to be present at the point of
 * consent. All four are here, in the athlete's own reading age rather than a
 * legal register.
 */
export const SMS_CONSENT_TEXT = [
  "I agree to receive text messages from PRform about my sleep and training:",
  "up to 2 scheduled messages a day, plus replies to anything I send.",
  "Message and data rates may apply. Reply STOP at any time to end them,",
  "or HELP for help. Consent is not a condition of using PRform.",
].join(" ");

/**
 * Shown next to the checkbox for anyone under 18. Not stored — it is guidance
 * to the athlete, not a term they agree to — but it belongs beside the consent
 * because most of the people reading it are 15.
 */
export const SMS_MINOR_NOTICE =
  "If you're under 18, check with a parent or guardian before turning this on. Only you can enable texts for your own number — a coach cannot do it for you.";
