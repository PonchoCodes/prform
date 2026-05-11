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
  date: Date;
  type: WorkoutType;
  distance: number;
  duration: number;
  averageHeartRate?: number;
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
