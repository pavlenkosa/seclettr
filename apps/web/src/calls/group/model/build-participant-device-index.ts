import type { GroupCallParticipantDevice } from "@/calls/group/model/group-call-types";

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
