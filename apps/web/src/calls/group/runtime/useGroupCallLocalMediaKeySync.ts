import { useCallback, useEffect, useRef, useState } from "react";
import {
  createGroupCallMediaKeyDeliveryTracker,
} from "@/calls/group/runtime/group-call/media-key-delivery";
import { createSessionStorageDeliveryStore } from "@/calls/group/runtime/group-call/media-key-delivery-store";
import { GROUP_CALL_MEDIA_KEY_ROTATION_INTERVAL_MS } from "@/calls/group/runtime/group-call/media-key-rotation";
import {
  shouldArmLocalGroupCallFrameEncryption,
  type GroupCallRuntimeMediaEncryptionMode,
} from "@/calls/group/runtime/group-call/media-encryption-negotiation";
import { logGroupCallInfo } from "@/calls/group/runtime/group-call/logger";
import { wsClient } from "@/lib/websocket";
import {
  type MediaKeyDeliveryState,
  type UseGroupCallMediaKeyRuntimeOptions,
} from "./group-call-media-key-runtime-shared";

interface UseGroupCallLocalMediaKeySyncOptions extends Pick<
  UseGroupCallMediaKeyRuntimeOptions,
  | "status"
  | "callId"
  | "deviceId"
  | "localRequestedMediaEncryptionMode"
  | "localAdvertisedMediaEncryptionMode"
  | "effectiveMediaEncryptionMode"
  | "effectiveFrameEncryptionEnabled"
  | "expectedRemoteDeviceIds"
  | "acknowledgedExpectedRemoteDeviceCount"
  | "localMediaKey"
  | "setLocalMediaKey"
  | "setSharedMediaKeyDeviceCount"
  | "setError"
  | "localMediaKeyRef"
  | "sharedMediaKeyTargetsRef"
  | "mediaKeyRotationStateRef"
  | "mediaKeyDeliveryTrackerRef"
  | "sfuClientRef"
  | "mediaKeyFallbackMessage"
> {}

export function useGroupCallLocalMediaKeySync({
  status,
  callId,
  deviceId,
  localRequestedMediaEncryptionMode,
  localAdvertisedMediaEncryptionMode,
  effectiveMediaEncryptionMode,
  effectiveFrameEncryptionEnabled,
  expectedRemoteDeviceIds,
  acknowledgedExpectedRemoteDeviceCount,
  localMediaKey,
  setLocalMediaKey,
  setSharedMediaKeyDeviceCount,
  setError,
  localMediaKeyRef,
  sharedMediaKeyTargetsRef,
  mediaKeyRotationStateRef,
  mediaKeyDeliveryTrackerRef,
  sfuClientRef,
  mediaKeyFallbackMessage,
}: UseGroupCallLocalMediaKeySyncOptions) {
  const [wsConnected, setWsConnected] = useState(wsClient.connected);
  const [mediaKeyRotationTick, setMediaKeyRotationTick] = useState(0);
  const effectiveMediaEncryptionModeRef = useRef<GroupCallRuntimeMediaEncryptionMode>(effectiveMediaEncryptionMode);
  const mediaKeyDeliveryStateRef = useRef<MediaKeyDeliveryState>({
    keyId: null,
    attemptedTargetDeviceIds: new Set(),
    exhaustedTargetDeviceIds: new Set(),
  });

  // Keep effectiveMediaEncryptionModeRef in sync for use inside stable callbacks.
  useEffect(() => {
    effectiveMediaEncryptionModeRef.current = effectiveMediaEncryptionMode;
  }, [effectiveMediaEncryptionMode]);

  const resetMediaKeyDeliveryState = useCallback((keyId: string | null) => {
    mediaKeyDeliveryStateRef.current = {
      keyId,
      attemptedTargetDeviceIds: new Set(),
      exhaustedTargetDeviceIds: new Set(),
    };
  }, []);

  const evaluateBalancedMediaKeyFallback = useCallback((keyId: string) => {
    if (effectiveMediaEncryptionModeRef.current !== "best-effort") {
      return;
    }

    const currentLocalMediaKey = localMediaKeyRef.current;
    if (currentLocalMediaKey?.keyId !== keyId) {
      return;
    }
    if (sharedMediaKeyTargetsRef.current.size > 0) {
      return;
    }

    const state = mediaKeyDeliveryStateRef.current;
    if (state.keyId !== keyId) {
      return;
    }
    if (state.attemptedTargetDeviceIds.size === 0) {
      return;
    }
    if (state.exhaustedTargetDeviceIds.size < state.attemptedTargetDeviceIds.size) {
      return;
    }

    localMediaKeyRef.current = null;
    setLocalMediaKey(null);
    sfuClientRef.current?.setLocalMediaKey(null);
    setError((current) => current ?? mediaKeyFallbackMessage);
  }, [localMediaKeyRef, mediaKeyFallbackMessage, setError, setLocalMediaKey, sfuClientRef, sharedMediaKeyTargetsRef]);

  const markMediaKeyDeliveryAttempt = useCallback((targetDeviceId: string, keyId: string) => {
    if (mediaKeyDeliveryStateRef.current.keyId !== keyId) {
      resetMediaKeyDeliveryState(keyId);
    }
    mediaKeyDeliveryStateRef.current.attemptedTargetDeviceIds.add(targetDeviceId);
  }, [resetMediaKeyDeliveryState]);

  const markMediaKeyDeliveryExhausted = useCallback((targetDeviceId: string, keyId: string) => {
    const current = mediaKeyDeliveryStateRef.current;
    if (current.keyId !== keyId) {
      return;
    }
    current.exhaustedTargetDeviceIds.add(targetDeviceId);
    evaluateBalancedMediaKeyFallback(keyId);
  }, [evaluateBalancedMediaKeyFallback]);

  // Mirror WS connection state so effects that re-send on reconnect re-fire.
  useEffect(() => {
    let active = true;
    const unsubscribe = wsClient.onConnectionChange((connected) => {
      if (!active) return;
      setWsConnected(connected);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  // Advertise local encryption mode to peers whenever it changes or WS reconnects.
  useEffect(() => {
    if (!callId || !deviceId || status !== "ready") {
      return;
    }

    wsClient.send(
      {
        type: "group.call.media-mode",
        callId,
        mode: localAdvertisedMediaEncryptionMode,
      },
      {
        queueIfDisconnected: true,
        queueKey: `group.call.media-mode:${callId}:${deviceId}`,
        ttlMs: 15_000,
      }
    );
  }, [callId, deviceId, localAdvertisedMediaEncryptionMode, status, wsConnected]);

  // Push current key + arm/disarm decision to the SFU client on every key change.
  useEffect(() => {
    localMediaKeyRef.current = localMediaKey;
    const shouldArmFrameEncryption = shouldArmLocalGroupCallFrameEncryption({
      requestedMode: localRequestedMediaEncryptionMode,
      effectiveFrameEncryptionEnabled,
      expectedRemoteDeviceCount: expectedRemoteDeviceIds.size,
      acknowledgedExpectedRemoteDeviceCount,
    });
    sfuClientRef.current?.setLocalMediaKey(
      shouldArmFrameEncryption ? (localMediaKey ?? null) : null
    );
    logGroupCallInfo("[group-call] local media key runtime sync", {
      callId,
      requestedMode: localRequestedMediaEncryptionMode,
      effectiveMediaEncryptionMode,
      armed: shouldArmFrameEncryption && Boolean(localMediaKey),
      epoch: localMediaKey?.epoch ?? null,
      keyId: localMediaKey?.keyId ?? null,
      acknowledgedExpectedRemoteDeviceCount,
      expectedRemoteDeviceCount: expectedRemoteDeviceIds.size,
    });
  }, [
    callId,
    acknowledgedExpectedRemoteDeviceCount,
    effectiveFrameEncryptionEnabled,
    effectiveMediaEncryptionMode,
    expectedRemoteDeviceIds,
    localMediaKey,
    localMediaKeyRef,
    localRequestedMediaEncryptionMode,
    sfuClientRef,
  ]);

  // Reset delivery tracking state whenever the active key changes.
  useEffect(() => {
    sharedMediaKeyTargetsRef.current = new Set();
    setSharedMediaKeyDeviceCount(0);
    mediaKeyDeliveryTrackerRef.current?.clear();
    resetMediaKeyDeliveryState(localMediaKey?.keyId ?? null);

    if (!localMediaKey) {
      mediaKeyRotationStateRef.current.lastRotatedAtMs = null;
      return;
    }

    mediaKeyRotationStateRef.current.lastRotatedAtMs ??= Date.now();
  }, [
    localMediaKey,
    mediaKeyDeliveryTrackerRef,
    mediaKeyRotationStateRef,
    resetMediaKeyDeliveryState,
    setSharedMediaKeyDeviceCount,
    sharedMediaKeyTargetsRef,
  ]);

  // Create/teardown the delivery tracker, which owns retry scheduling and ACK tracking.
  useEffect(() => {
    if (!callId || !deviceId) {
      mediaKeyDeliveryTrackerRef.current?.clear();
      mediaKeyDeliveryTrackerRef.current = null;
      resetMediaKeyDeliveryState(null);
      return;
    }

    const tracker = createGroupCallMediaKeyDeliveryTracker({
      callId,
      localDeviceId: deviceId,
      send: (message, options) => wsClient.send(message, options),
      onDeliveryExhausted: (payload) => {
        markMediaKeyDeliveryExhausted(payload.targetDeviceId, payload.keyId);
      },
      deliveredStore: createSessionStorageDeliveryStore(callId, deviceId),
    });

    mediaKeyDeliveryTrackerRef.current = tracker;
    return () => {
      tracker.clear();
      if (mediaKeyDeliveryTrackerRef.current === tracker) {
        mediaKeyDeliveryTrackerRef.current = null;
      }
    };
  }, [callId, deviceId, markMediaKeyDeliveryExhausted, mediaKeyDeliveryTrackerRef, resetMediaKeyDeliveryState]);

  // Drive periodic key rotation ticks while frame encryption is active.
  useEffect(() => {
    if (!effectiveFrameEncryptionEnabled || status !== "ready" || !callId || !localMediaKey) {
      return;
    }

    const timer = setInterval(() => {
      setMediaKeyRotationTick((current) => current + 1);
    }, GROUP_CALL_MEDIA_KEY_ROTATION_INTERVAL_MS);

    return () => {
      clearInterval(timer);
    };
  }, [callId, effectiveFrameEncryptionEnabled, localMediaKey, status]);

  return {
    wsConnected,
    mediaKeyRotationTick,
    markMediaKeyDeliveryAttempt,
    evaluateBalancedMediaKeyFallback,
  };
}
