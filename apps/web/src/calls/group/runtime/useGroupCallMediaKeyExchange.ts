/**
 * useGroupCallMediaKeyExchange — per-session media-key send/receive protocol.
 *
 * Composition hub that delegates to three sub-hooks:
 *   - useGroupCallInboundMediaKey — receives and decrypts incoming keys
 *   - useGroupCallInboundAckVerification — verifies incoming ACK proofs
 *   - useGroupCallOutboundMediaKeyShare — encrypts and delivers keys to
 *     remote participant devices
 */
import type { UseGroupCallMediaKeyRuntimeOptions } from "./media-key/media-key-runtime-shared";
import { useGroupCallInboundMediaKey } from "./useGroupCallInboundMediaKey";
import { useGroupCallInboundAckVerification } from "./useGroupCallInboundAckVerification";
import { useGroupCallOutboundMediaKeyShare } from "./useGroupCallOutboundMediaKeyShare";

interface UseGroupCallMediaKeyExchangeOptions extends Pick<
  UseGroupCallMediaKeyRuntimeOptions,
  | "session"
  | "callId"
  | "userId"
  | "deviceId"
  | "identityDhKeyPair"
  | "effectiveMediaEncryptionMode"
  | "effectiveFrameEncryptionEnabled"
  | "activeParticipantUserIds"
  | "activeParticipantDeviceIdsByUserId"
  | "localMediaKey"
  | "setLocalMediaKey"
  | "setSharedMediaKeyDeviceCount"
  | "setReceivedMediaKeyCount"
  | "setError"
  | "localMediaKeyRef"
  | "sharedMediaKeyTargetsRef"
  | "receivedMediaKeysRef"
  | "mediaKeyDeliveryTrackerRef"
  | "sfuClientRef"
  | "mediaKeyFallbackMessage"
> {
  wsConnected: boolean;
  markMediaKeyDeliveryAttempt: (targetDeviceId: string, keyId: string) => void;
  evaluateBalancedMediaKeyFallback: (keyId: string) => void;
}

export function useGroupCallMediaKeyExchange(options: UseGroupCallMediaKeyExchangeOptions) {
  useGroupCallInboundMediaKey({
    callId: options.callId,
    deviceId: options.deviceId,
    effectiveFrameEncryptionEnabled: options.effectiveFrameEncryptionEnabled,
    identityDhKeyPair: options.identityDhKeyPair,
    receivedMediaKeysRef: options.receivedMediaKeysRef,
    setReceivedMediaKeyCount: options.setReceivedMediaKeyCount,
    sfuClientRef: options.sfuClientRef,
  });

  useGroupCallInboundAckVerification({
    callId: options.callId,
    deviceId: options.deviceId,
    effectiveFrameEncryptionEnabled: options.effectiveFrameEncryptionEnabled,
    localMediaKeyRef: options.localMediaKeyRef,
    mediaKeyDeliveryTrackerRef: options.mediaKeyDeliveryTrackerRef,
    sharedMediaKeyTargetsRef: options.sharedMediaKeyTargetsRef,
    setSharedMediaKeyDeviceCount: options.setSharedMediaKeyDeviceCount,
  });

  useGroupCallOutboundMediaKeyShare({
    session: options.session,
    callId: options.callId,
    userId: options.userId,
    deviceId: options.deviceId,
    effectiveMediaEncryptionMode: options.effectiveMediaEncryptionMode,
    effectiveFrameEncryptionEnabled: options.effectiveFrameEncryptionEnabled,
    activeParticipantUserIds: options.activeParticipantUserIds,
    activeParticipantDeviceIdsByUserId: options.activeParticipantDeviceIdsByUserId,
    localMediaKey: options.localMediaKey,
    setLocalMediaKey: options.setLocalMediaKey,
    setSharedMediaKeyDeviceCount: options.setSharedMediaKeyDeviceCount,
    setError: options.setError,
    localMediaKeyRef: options.localMediaKeyRef,
    sharedMediaKeyTargetsRef: options.sharedMediaKeyTargetsRef,
    mediaKeyDeliveryTrackerRef: options.mediaKeyDeliveryTrackerRef,
    sfuClientRef: options.sfuClientRef,
    mediaKeyFallbackMessage: options.mediaKeyFallbackMessage,
    wsConnected: options.wsConnected,
    markMediaKeyDeliveryAttempt: options.markMediaKeyDeliveryAttempt,
    evaluateBalancedMediaKeyFallback: options.evaluateBalancedMediaKeyFallback,
  });
}
