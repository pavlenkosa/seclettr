import { useEffect } from "react";
import { createLocalGroupCallMediaKey } from "@/calls/group/runtime/group-call/media-key";
import {
  buildGroupCallParticipantFingerprint,
  decideGroupCallMediaKeyRotation,
} from "@/calls/group/runtime/group-call/media-key-rotation";
import { logGroupCallInfo } from "@/calls/group/runtime/group-call/logger";
import {
  type UseGroupCallMediaKeyRuntimeOptions,
} from "./group-call-media-key-runtime-shared";

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
