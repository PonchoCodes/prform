export type WorkoutType =
  | "easy"
  | "moderate"
  | "tempo"
  | "long_run"
  | "track"
  | "race"
  | "rest"
  | "cross_train";

/**
 * The session types that cost something to absorb. The same four the sleep
 * algorithm gives a larger training-load bonus and the verdict treats as the
 * day to back off from; the coach-side forecast and the meet view read from
 * here so "hard" means one thing everywhere.
 */
export const HARD_WORKOUT_TYPES: ReadonlySet<string> = new Set<string>([
  "tempo",
  "track",
  "long_run",
  "race",
]);

export function isHardWorkout(type: string): boolean {
  return HARD_WORKOUT_TYPES.has(type);
}

export interface NormalizedWorkout {
  id?: string;           // DB id for manual one-off workouts; undefined for Strava/assumed
  date: Date;
  type: WorkoutType;
  distance: number;
  duration: number;
  averageHeartRate?: number;
  effort?: number | null; // session RPE 1–10 (manual workouts only); feeds training load
  /** Self-reported session quality (manual workouts only). */
  quality?: "NAILED_IT" | "FINE" | "ROUGH" | null;
  source: "strava" | "manual" | "team" | "assumed";
  isTentative: boolean;
  stravaActivityId?: string;
  manualOverride?: boolean;
  /** Coach's note for a team session ("5x1k — hit rhythm, not heroics"). */
  note?: string;
}

export interface WorkoutConflict {
  workoutId: string;
  date: string;
  stravaName: string;
  manualType: string;
  conflictDismissed: boolean;
}
