export function mpsToMinPerMile(speedMs: number): string {
  if (!speedMs || speedMs <= 0) return "--";
  const minPerMile = 1609.34 / (speedMs * 60);
  const min = Math.floor(minPerMile);
  const sec = Math.round((minPerMile % 1) * 60).toString().padStart(2, "0");
  return `${min}:${sec} /mi`;
}
