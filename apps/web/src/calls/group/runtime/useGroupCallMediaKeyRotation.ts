/**
 * useGroupCallMediaKeyRotation — React hook that drives periodic and event-based key rotation.
 *
 * Owns:
 *   - The useEffect that fires on participantUserIds or mediaKeyRotationTick changes
 *   - Computes the participant fingerprint and calls decideGroupCallMediaKeyRotation
 *   - Updates mediaKeyRotationStateRef.participantFingerprint after each decision
 *   - Generates the next media key (createLocalGroupCallMediaKey) and sets it on
 *     localMediaKeyRef + React state when rotation is required
 *
 * Does not own the rotation interval timer (see useGroupCallLocalMediaKeySync),
 * the rotation policy itself (see media-key-rotation.ts), or key delivery.
 */
import { useEffect } from "react";
import { createLocalGroupCallMediaKey } from "@/calls/group/runtime/media-key/media-key";
import {
  buildGroupCallParticipantFingerprint,
  decideGroupCallMediaKeyRotation,
} from "@/calls/group/runtime/media-key/media-key-rotation";
import { logGroupCallInfo } from "@/calls/group/runtime/media-key/logger";
import {
  type UseGroupCallMediaKeyRuntimeOptions,
} from "./media-key/media-key-runtime-shared";

interface UseGroupCallMediaKeyRotationOptions extends Pick<
  UseGroupCallMediaKeyRuntimeOptions,
  | "activeParticipantUserIds"
  | "callId"
  | "effectiveFrameEncryptionEnabled"
  | "localMediaKey"
  | "setLocalMediaKey"
  | "localMediaKeyRef"
  | "mediaKeyRotationStateRef"
  | "status"
> {
  mediaKeyRotationTick: number;
}

export function useGroupCallMediaKeyRotation({
  activeParticipantUserIds,
  callId,
  effectiveFrameEncryptionEnabled,
  localMediaKey,
  setLocalMediaKey,
  localMediaKeyRef,
  mediaKeyRotationStateRef,
  status,
  mediaKeyRotationTick,
}: UseGroupCallMediaKeyRotationOptions) {
  useEffect(() => {
    if (!effectiveFrameEncryptionEnabled || status !== "ready" || !callId || !localMediaKey) {
      return;
    }

    const nowMs = Date.now();
    const participantFingerprint = buildGroupCallParticipantFingerprint(activeParticipantUserIds);
    const rotationDecision = decideGroupCallMediaKeyRotation({
      localMediaKey,
      participantFingerprint,
      previousParticipantFingerprint: mediaKeyRotationStateRef.current.participantFingerprint,
      nowMs,
      lastRotatedAtMs: mediaKeyRotationStateRef.current.lastRotatedAtMs,
    });

    mediaKeyRotationStateRef.current.participantFingerprint = participantFingerprint;

    if (!rotationDecision.rotate || rotationDecision.nextEpoch <= localMediaKey.epoch) {
      return;
    }

    mediaKeyRotationStateRef.current.lastRotatedAtMs = nowMs;
    const rotatedMediaKey = createLocalGroupCallMediaKey(rotationDecision.nextEpoch);
    localMediaKeyRef.current = rotatedMediaKey;
    setLocalMediaKey(rotatedMediaKey);
    logGroupCallInfo("[group-call] local media key rotated", {
      callId,
      previousEpoch: localMediaKey.epoch,
      nextEpoch: rotatedMediaKey.epoch,
      reason: rotationDecision.reason,
      keyId: rotatedMediaKey.keyId,
    });
  }, [
    activeParticipantUserIds,
    callId,
    effectiveFrameEncryptionEnabled,
    localMediaKey,
    localMediaKeyRef,
    mediaKeyRotationStateRef,
    mediaKeyRotationTick,
    setLocalMediaKey,
    status,
  ]);
}
