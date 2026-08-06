// Every outbound message body, in one file.
//
// Kept together because the voice has to be consistent across a conversation
// that arrives one line at a time, and because the exact wording of anything
// carrier-facing (HELP, STOP) is a compliance artefact rather than a design
// choice.
//
// House style: lower-case sentence case, no exclamation marks, no emoji, and a
// number wherever there is one to give. These land on a lock screen at 21:00
// next to messages from the athlete's friends — anything that reads like
// marketing gets muted, and a muted athlete is a lost one.

/** Twilio counts a segment at 160 GSM-7 characters. Two is the practical limit. */
export const MAX_BODY_LENGTH = 320;

export function eveningWakeQuestion(): string {
  return "What time are you up tomorrow?";
}

/** Sent once a wake time has been understood. `bedtime` is "H:MM am/pm". */
export function lightsOut(bedtime: string): string {
  return `Then lights out by ${bedtime}. Reply BED when you're down.`;
}

/** Confirms a BED reply. `onset` is the receipt time, "H:MM am/pm". */
export function bedAcknowledged(onset: string): string {
  return `Got it — ${onset}. Sleep well.`;
}

/** When nothing parsed. Asks for one specific thing rather than guessing. */
export function clarification(): string {
  return "Sorry — I didn't catch that. What time are you getting up? Something like 5:30am works.";
}

export function helpReply(): string {
  return "PRform sleep texts. Reply BED when you're down, or a time like 5:30am to set tomorrow's wake-up. Reply STOP to end texts. Support: help@prform.app";
}

export function stopAcknowledged(): string {
  return "You're unsubscribed from PRform texts. No more messages will be sent.";
}

export function verificationCode(code: string): string {
  return `Your PRform code is ${code}. It expires in 10 minutes.`;
}

/**
 * The morning message: one instruction, plus a question only when we still
 * need one.
 *
 * The text has to be fixed the night before, because the provider schedules it
 * then. `askForBedtime` is therefore decided at schedule time and the message
 * re-scheduled if a BED reply changes the answer — which is why the two parts
 * are separate arguments rather than one composed string.
 */
export function morningMessage(input: { headline: string; askForBedtime: boolean }): string {
  return input.askForBedtime
    ? `${input.headline} What time did you get down last night?`
    : input.headline;
}

/**
 * The morning headline, taken from the verdict rather than composed here.
 *
 * `computeVerdict` is the single place that decides what an athlete should run
 * today, and the text has to agree with the dashboard word for word — the same
 * person reads both within a minute of each other. The reason is included
 * because a text has no second line to put it on and no card to open.
 */
export function verdictHeadline(verdict: { verdict: string; reason: string }): string {
  return `${verdict.verdict} ${verdict.reason}`;
}

/** Formats "HH:MM" 24h as the "8:15pm" a person would text. */
export function friendlyTime(clock24: string): string {
  const [h, m] = clock24.split(":").map(Number);
  const period = h >= 12 ? "pm" : "am";
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, "0")}${period}`;
}
