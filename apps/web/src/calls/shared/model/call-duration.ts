export interface CallDurationClock {
  baseSeconds: number;
  startedAtMs: number | null | undefined;
}

export function resolveCallDurationSeconds(
  { baseSeconds, startedAtMs }: CallDurationClock,
  nowMs = Date.now()
): number {
  if (startedAtMs === null || startedAtMs === undefined) {
    return Math.max(0, Math.floor(baseSeconds));
  }

  const elapsedSeconds = Math.floor(Math.max(0, nowMs - startedAtMs) / 1000);
  return Math.max(0, Math.floor(baseSeconds) + elapsedSeconds);
}

export function formatCallDuration(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safeSeconds / 60)}:${String(safeSeconds % 60).padStart(2, "0")}`;
}
