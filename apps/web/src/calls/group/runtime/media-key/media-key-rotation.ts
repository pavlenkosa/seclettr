/**
 * media-key-rotation — media key rotation policy and participant fingerprint helpers.
 *
 * Owns:
 *   - GROUP_CALL_MEDIA_KEY_ROTATION_INTERVAL_MS — 5-minute periodic rotation interval
 *   - GROUP_CALL_MEDIA_KEY_EPOCH_WRAP — epoch ceiling to prevent integer overflow in long calls
 *   - GroupCallMediaKeyRotationDecision / GroupCallMediaKeyRotationInput type definitions
 *   - buildGroupCallParticipantFingerprint — produces a stable sorted user-ID string for
 *     change detection (participant join/leave triggers key rotation)
 *   - decideGroupCallMediaKeyRotation — pure decision function that returns whether to rotate,
 *     the reason ("participant-change" | "interval"), and the next epoch number
 *
 * Does not own key generation, delivery, or the React hook that drives rotation ticks
 * (see useGroupCallMediaKeyRotation and useGroupCallLocalMediaKeySync).
 */
import type { LocalGroupCallMediaKey } from "./media-key";

export const GROUP_CALL_MEDIA_KEY_ROTATION_INTERVAL_MS = 5 * 60_000;
// Epoch wraps at this boundary rather than hard-stopping, so very long calls
// (or high churn) keep rotating. The value fits safely in a 20-bit field.
export const GROUP_CALL_MEDIA_KEY_EPOCH_WRAP = 1_000_000;

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
      nextEpoch: (currentEpoch + 1) % GROUP_CALL_MEDIA_KEY_EPOCH_WRAP,
    };
  }

  if (input.lastRotatedAtMs !== null && input.nowMs - input.lastRotatedAtMs >= intervalMs) {
    return {
      rotate: true,
      reason: "interval",
      nextEpoch: (currentEpoch + 1) % GROUP_CALL_MEDIA_KEY_EPOCH_WRAP,
    };
  }

  return {
    rotate: false,
    reason: null,
    nextEpoch: currentEpoch,
  };
}
