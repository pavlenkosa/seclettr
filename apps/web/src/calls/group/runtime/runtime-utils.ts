import { ApiError } from "@/lib/api";
import type { GroupCallParticipantDevice, MinimizedDockPosition } from "@/calls/group/model/group-call-types";

export function buildParticipantDeviceIndex(
  participantDevices: GroupCallParticipantDevice[]
): Record<string, string[]> {
  const index = new Map<string, Set<string>>();
  for (const entry of participantDevices) {
    if (!entry.userId || !entry.deviceId) continue;
    const byUser = index.get(entry.userId) ?? new Set<string>();
    byUser.add(entry.deviceId);
    index.set(entry.userId, byUser);
  }

  return Object.fromEntries(
    [...index.entries()].map(([userId, deviceIds]) => [
      userId,
      [...deviceIds].sort((left, right) => left.localeCompare(right)),
    ])
  );
}

export function clampGroupCallMinimizedDockPosition(
  position: MinimizedDockPosition,
  width: number,
  height: number
): MinimizedDockPosition {
  const margin = 8;
  const maxX = Math.max(margin, globalThis.innerWidth - width - margin);
  const maxY = Math.max(margin, globalThis.innerHeight - height - margin);
  return {
    x: Math.min(maxX, Math.max(margin, position.x)),
    y: Math.min(maxY, Math.max(margin, position.y)),
  };
}

export function resolveErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError && error.message) {
    return error.message;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

export function isMediaCaptureError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = "name" in error ? String(error.name) : "";
  return [
    "AbortError",
    "NotAllowedError",
    "NotFoundError",
    "NotReadableError",
    "OverconstrainedError",
    "SecurityError",
  ].includes(name);
}
