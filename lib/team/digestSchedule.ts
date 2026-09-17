// When a team's Monday digest is due, decided as a pure function of the
// clock and the team's own settings so the cron route is a loop and nothing
// more.
//
// The cron fires every hour. A team is due when it is Monday in the team's
// zone, the local hour is the send hour, and no digest has been stamped for
// this local Monday yet. The stamp is what makes the hourly cadence safe:
// however the cron's timing drifts inside the hour, a second pass in the
// same hour finds the stamp and does nothing.

import { localClockOf, localDateOf } from "@/lib/messaging/time";
import { toUtc } from "@/lib/dateKeys";

/** 06:00 local. A coach reads it on the way to Monday practice. */
export const DIGEST_SEND_HOUR = 6;

export interface DigestTeamSettings {
  timezone: string;
  digestEnabled: boolean;
  /** The local Monday the last digest was sent for, or null. */
  digestLastSentOn: string | null;
}

export type DigestDecision =
  | { due: true; localMonday: string }
  | { due: false; reason: "disabled" | "not_monday" | "not_send_hour" | "already_sent" };

export function digestDecision(team: DigestTeamSettings, now: Date): DigestDecision {
  if (!team.digestEnabled) return { due: false, reason: "disabled" };

  const localDate = localDateOf(now, team.timezone);
  if (toUtc(localDate).getUTCDay() !== 1) return { due: false, reason: "not_monday" };

  const hour = Number(localClockOf(now, team.timezone).split(":")[0]);
  if (hour !== DIGEST_SEND_HOUR) return { due: false, reason: "not_send_hour" };

  if (team.digestLastSentOn === localDate) return { due: false, reason: "already_sent" };

  return { due: true, localMonday: localDate };
}
