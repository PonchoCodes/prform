// Allowlist for the `user` object sent to the browser.
//
// The User row carries credentials (bcrypt `password`, Strava access/refresh
// tokens) and billing identifiers (`stripeCustomerId`, `stripeSubscriptionId`).
// None of it may reach the client. A Prisma `select` alone is not enough
// protection: the moment someone adds a field to the select because the route
// needs it server-side, it also ships to the browser. So the response is built
// by naming fields explicitly here, and only what a page actually reads is
// listed.
//
// Anything added below must be safe to expose to the account's own owner.

/** Exactly the fields the dashboard reads off the sleep-plan response. */
export interface ClientUser {
  prDistanceId: string | null;
  prPromptDismissedAt: Date | null;
  unitPreference: string;
}

/** Key list, exported so tests can assert the shape without duplicating it. */
export const CLIENT_USER_FIELDS = [
  "prDistanceId",
  "prPromptDismissedAt",
  "unitPreference",
] as const;

/** Source fields required to build a ClientUser — spread into a Prisma select. */
export const CLIENT_USER_SELECT = {
  prDistanceId: true,
  prPromptDismissedAt: true,
  unitPreference: true,
} as const;

/**
 * Narrows a User row to the fields the browser is allowed to see. Every field
 * is named explicitly — never spread the source object here.
 */
export function toClientUser(user: {
  prDistanceId?: string | null;
  prPromptDismissedAt?: Date | null;
  unitPreference?: string | null;
}): ClientUser {
  return {
    prDistanceId: user.prDistanceId ?? null,
    prPromptDismissedAt: user.prPromptDismissedAt ?? null,
    unitPreference: user.unitPreference ?? "imperial",
  };
}
