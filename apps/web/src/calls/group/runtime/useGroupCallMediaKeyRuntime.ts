import { type UseGroupCallMediaKeyRuntimeOptions } from "./group-call-media-key-runtime-shared";
import { useGroupCallLocalMediaKeySync } from "./useGroupCallLocalMediaKeySync";
import { useGroupCallMediaKeyRotation } from "./useGroupCallMediaKeyRotation";
import { useGroupCallMediaKeyExchange } from "./useGroupCallMediaKeyExchange";

export function useGroupCallMediaKeyRuntime(options: UseGroupCallMediaKeyRuntimeOptions): void {
  const {
    activeParticipantUserIds,
    callId,
    effectiveFrameEncryptionEnabled,
    localMediaKey,
    setLocalMediaKey,
    localMediaKeyRef,
    mediaKeyRotationStateRef,
    status,
  } = options;

  const {
    wsConnected,
    mediaKeyRotationTick,
    markMediaKeyDeliveryAttempt,
    evaluateBalancedMediaKeyFallback,
  } = useGroupCallLocalMediaKeySync(options);

  useGroupCallMediaKeyRotation({
    activeParticipantUserIds,
    callId,
    effectiveFrameEncryptionEnabled,
    localMediaKey,
    setLocalMediaKey,
    localMediaKeyRef,
    mediaKeyRotationStateRef,
    status,
    mediaKeyRotationTick,
  });

  useGroupCallMediaKeyExchange({
    ...options,
    wsConnected,
    markMediaKeyDeliveryAttempt,
    evaluateBalancedMediaKeyFallback,
  });
}
