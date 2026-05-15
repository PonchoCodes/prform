export type UnitPreference = "imperial" | "metric";

export function formatPace(speedMs: number, unit: UnitPreference): string {
  if (!speedMs || speedMs <= 0) return "--";
  if (unit === "imperial") {
    const minPerMile = 1609.34 / (speedMs * 60);
    const min = Math.floor(minPerMile);
    const sec = Math.round((minPerMile % 1) * 60).toString().padStart(2, "0");
    return `${min}:${sec} /mi`;
  } else {
    const minPerKm = 1000 / (speedMs * 60);
    const min = Math.floor(minPerKm);
    const sec = Math.round((minPerKm % 1) * 60).toString().padStart(2, "0");
    return `${min}:${sec} /km`;
  }
}

export function formatDistance(meters: number, unit: UnitPreference): string {
  if (unit === "imperial") {
    return (meters / 1609.34).toFixed(2) + " mi";
  } else {
    return (meters / 1000).toFixed(2) + " km";
  }
}

export function formatPaceAdjustment(secondsPerMile: number, unit: UnitPreference): string {
  if (unit === "imperial") {
    return `${Math.round(secondsPerMile)}s /mi`;
  } else {
    return `${Math.round(secondsPerMile / 1.60934)}s /km`;
  }
}
