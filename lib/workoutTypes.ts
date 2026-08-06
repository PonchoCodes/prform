export type WorkoutType =
  | "easy"
  | "moderate"
  | "tempo"
  | "long_run"
  | "track"
  | "race"
  | "rest"
  | "cross_train";

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
  source: "strava" | "manual" | "assumed";
  isTentative: boolean;
  stravaActivityId?: string;
  manualOverride?: boolean;
}

export interface WorkoutConflict {
  workoutId: string;
  date: string;
  stravaName: string;
  manualType: string;
  conflictDismissed: boolean;
}
