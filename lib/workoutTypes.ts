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
  effort?: number | null; // 1–5 RPE rating (manual workouts only); drives Seiler zone scaling
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
