// Resolves an athlete's effective training paces from the two available
// signals — a declared personal best and observed workout history — and reports
// which one the answer came from.
//
// No server imports, so this is safe to use in client components.

import {
  blendVdot,
  pacesFromVdot,
  prDistanceById,
  prRecencyById,
  recencyToDate,
  round1,
  validatePrTime,
  vdotFromPr,
  type PaceSource,
  type PaceTable,
} from "@/lib/vdot";

/** The declared-PR fields as stored on the User row. */
export interface DeclaredPrFields {
  prDistanceId?: string | null;
  prTimeSeconds?: number | null;
  prRecency?: string | null;
  prSetOn?: Date | string | null;
}

export interface ObservedFitness {
  vdot: number | null;
  qualifyingEfforts: number;
}

export interface ResolvedPaces {
  vdot: number | null;
  paces: PaceTable | null;
  source: PaceSource;
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * VDOT implied by the athlete's declared PR, or null if none is stored or the
 * stored value no longer validates.
 */
export function declaredVdotFor(user: DeclaredPrFields): number | null {
  if (!user.prDistanceId || user.prTimeSeconds == null) return null;
  return vdotFromPr(user.prDistanceId, user.prTimeSeconds);
}

/**
 * The date we treat the PR as having been set. Prefers the stored date, falling
 * back to deriving one from the recency bucket for rows written before
 * `prSetOn` was populated.
 */
export function prDateFor(user: DeclaredPrFields, now: Date = new Date()): Date | null {
  return toDate(user.prSetOn) ?? (user.prRecency ? recencyToDate(user.prRecency, now) : null);
}

/**
 * Resolves the pace table to show this athlete, together with its provenance.
 *
 * Day one with a PR → PR-derived paces. No PR and no hard efforts → nothing,
 * rather than a confidently wrong guess. In between → a blend that shifts
 * gradually toward observed fitness, so paces never jump without a visible cause.
 */
export function resolvePaces(
  user: DeclaredPrFields,
  observed: ObservedFitness,
  now: Date = new Date(),
): ResolvedPaces {
  const declaredVdot = declaredVdotFor(user);
  const distance = user.prDistanceId ? prDistanceById(user.prDistanceId) : null;

  const source = blendVdot({
    declaredVdot,
    declaredDistanceLabel: distance?.label ?? null,
    prSetOn: prDateFor(user, now),
    observedVdot: observed.vdot,
    qualifyingEfforts: observed.qualifyingEfforts,
    now,
  });

  if (source.vdot == null) {
    return { vdot: null, paces: null, source };
  }

  const vdot = round1(source.vdot);
  return { vdot, paces: pacesFromVdot(vdot), source: { ...source, vdot } };
}

/**
 * Validates a submitted PR and shapes it for persistence. Returns an empty
 * object when the input is absent or implausible, so callers can spread it into
 * a Prisma update without branching — a rejected PR simply leaves the athlete
 * on history-inferred paces.
 */
export function buildDeclaredPrUpdate(
  distanceId: unknown,
  timeSeconds: unknown,
  recency: unknown,
  now: Date = new Date(),
): {
  prDistanceId?: string;
  prTimeSeconds?: number;
  prRecency?: string;
  prSetOn?: Date;
} {
  if (typeof distanceId !== "string" || typeof timeSeconds !== "number") return {};
  if (!Number.isFinite(timeSeconds)) return {};
  if (!prDistanceById(distanceId)) return {};
  if (!validatePrTime(distanceId, timeSeconds).ok) return {};

  const recencyId = typeof recency === "string" && prRecencyById(recency) ? recency : null;

  return {
    prDistanceId: distanceId,
    prTimeSeconds: timeSeconds,
    ...(recencyId
      ? { prRecency: recencyId, prSetOn: recencyToDate(recencyId, now) as Date }
      : { prSetOn: now }),
  };
}

/** True when this athlete should be asked to supply a PR. */
export function shouldPromptForPr(
  user: DeclaredPrFields & { prPromptDismissedAt?: Date | string | null },
): boolean {
  if (user.prDistanceId && user.prTimeSeconds != null) return false;
  return !toDate(user.prPromptDismissedAt);
}
