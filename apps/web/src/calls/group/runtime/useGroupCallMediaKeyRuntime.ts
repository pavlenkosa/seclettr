/**
 * useGroupCallMediaKeyRuntime — top-level compositor for the media-key runtime hooks.
 *
 * Owns:
 *   - Composition of useGroupCallLocalMediaKeySync, useGroupCallMediaKeyRotation,
 *     and useGroupCallMediaKeyExchange under a single call-site hook
 *   - Wires the outputs of useGroupCallLocalMediaKeySync (wsConnected, mediaKeyRotationTick,
 *     markMediaKeyDeliveryAttempt, evaluateBalancedMediaKeyFallback) into the downstream hooks
 *
 * Does not own any logic directly — all responsibility is delegated to the three composed hooks.
 * See group-call-media-key-runtime-shared.ts for the shared options contract.
 */
import { type UseGroupCallMediaKeyRuntimeOptions } from "./media-key/media-key-runtime-shared";
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
