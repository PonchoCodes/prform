// The rules a nudge obeys, stated once and pure so the route can be thin.
//
//   Channel   a verified, active number goes by text; anyone else by email.
//             The same isSmsReady the scheduled messages use, so a nudge
//             can never text a number the evening question would not.
//   One a day one nudge per athlete, per team, per athlete-local day. The
//             athlete's day, not the coach's: a coach in one zone tapping at
//             23:50 and again at 00:10 has sent one nudge as far as the
//             person receiving it is concerned only if the line is drawn on
//             their clock.
//
// The route enforces both by reading the latest Nudge row and calling
// canNudgeAgain; nudge.test.ts pins the decision, and the route-scan test
// pins that every /api/teams route resolves identity from the session.

import { isSmsReady } from "@/lib/messaging/channel";
import { instantFromLocal, localDateOf } from "@/lib/messaging/time";

export type NudgeChannel = "SMS" | "EMAIL";

export interface NudgeSubject {
  phoneNumber: string | null;
  phoneVerifiedAt: Date | null;
  smsStatus: "UNVERIFIED" | "ACTIVE" | "STOPPED";
  ianaTimezone: string | null;
}

/** Text when the number is verified and active; email otherwise. */
export function nudgeChannelFor(user: NudgeSubject): NudgeChannel {
  return isSmsReady(user) ? "SMS" : "EMAIL";
}

/** The zone the athlete's day is measured in. UTC when none is on file. */
export function nudgeZoneFor(user: { ianaTimezone: string | null }): string {
  return user.ianaTimezone ?? "UTC";
}

/** The instant the athlete's current local day began. */
export function nudgeWindowStart(now: Date, timeZone: string): Date {
  return instantFromLocal(localDateOf(now, timeZone), "00:00", timeZone).instant;
}

/**
 * Whether a nudge may go now, given when the last one to this athlete from
 * this team went. Null means never.
 */
export function canNudgeAgain(lastNudgeAt: Date | null, now: Date, timeZone: string): boolean {
  if (!lastNudgeAt) return true;
  return lastNudgeAt.getTime() < nudgeWindowStart(now, timeZone).getTime();
}

export type NudgeOutcome =
  | "sent"
  | "dry_run"
  | "already_today"
  | "unreachable"
  | "blocked"
  | "failed";
