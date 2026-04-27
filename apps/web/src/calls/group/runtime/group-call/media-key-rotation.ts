import type { LocalGroupCallMediaKey } from "./media-key";

export const GROUP_CALL_MEDIA_KEY_ROTATION_INTERVAL_MS = 5 * 60_000;
export const GROUP_CALL_MEDIA_KEY_MAX_EPOCH = 1_000_000;

type GroupCallMediaKeyRotationReason = "participant-change" | "interval";

export interface GroupCallMediaKeyRotationDecision {
  rotate: boolean;
  reason: GroupCallMediaKeyRotationReason | null;
  nextEpoch: number;
}

export interface GroupCallMediaKeyRotationInput {
  localMediaKey: LocalGroupCallMediaKey;
  participantFingerprint: string;
  previousParticipantFingerprint: string | null;
  nowMs: number;
  lastRotatedAtMs: number | null;
  intervalMs?: number;
}

export function buildGroupCallParticipantFingerprint(userIds: string[]): string {
  return [...new Set(userIds)]
    .sort((left, right) => left.localeCompare(right))
    .join(",");
}

export function decideGroupCallMediaKeyRotation(
  input: GroupCallMediaKeyRotationInput
): GroupCallMediaKeyRotationDecision {
  const currentEpoch = input.localMediaKey.epoch;
  if (currentEpoch >= GROUP_CALL_MEDIA_KEY_MAX_EPOCH) {
    return {
      rotate: false,
      reason: null,
      nextEpoch: currentEpoch,
    };
  }

  const intervalMs = input.intervalMs ?? GROUP_CALL_MEDIA_KEY_ROTATION_INTERVAL_MS;
  const previousFingerprint = input.previousParticipantFingerprint;
  const participantChanged = (
    previousFingerprint !== null &&
    previousFingerprint !== input.participantFingerprint
  );

  if (participantChanged) {
    return {
      rotate: true,
      reason: "participant-change",
      nextEpoch: Math.min(currentEpoch + 1, GROUP_CALL_MEDIA_KEY_MAX_EPOCH),
    };
  }

  if (input.lastRotatedAtMs !== null && input.nowMs - input.lastRotatedAtMs >= intervalMs) {
    return {
      rotate: true,
      reason: "interval",
      nextEpoch: Math.min(currentEpoch + 1, GROUP_CALL_MEDIA_KEY_MAX_EPOCH),
    };
  }

  return {
    rotate: false,
    reason: null,
    nextEpoch: currentEpoch,
  };
}
