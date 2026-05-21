/**
 * useGroupCallSessionRuntime — session-level action coordinator for group calls.
 *
 * Owns:
 *   - Session-scoped mutable refs: callIdRef, didEndRef, ownsServerCallRef,
 *     joinedParticipantRef, actionInFlightRef, unloadCleanupSentRef, activeStreamRef
 *   - performUnloadCleanup — best-effort keepalive-leave sent on page unload
 *   - endServerRoom — updates call status on the API (ends the server room)
 *   - leaveCurrentCall — removes the local participant from the call via the API
 *   - handleLeave / handleEndForEveryone — user-initiated leave and host end actions
 *   - Composition of useGroupCallSessionLifecycle, useGroupCallSessionSubscriptions,
 *     and useGroupCallPresenceHeartbeat under a single hook
 *
 * Does not own local media controls (useGroupCallLocalMedia), the panel presentation
 * layer, or media-key exchange. Returned callbacks (handleLeave, handleEndForEveryone)
 * are passed into the presentation layer for UI binding.
 */
import {
  useCallback,
  useRef,
} from "react";
import { api } from "@/lib/api";
import {
  useGroupCallSessionLifecycle,
} from "./useGroupCallSessionLifecycle";
import {
  useGroupCallSessionSubscriptions,
} from "./useGroupCallSessionSubscriptions";
import {
  useGroupCallPresenceHeartbeat,
} from "./useGroupCallPresenceHeartbeat";
import type {
  UseGroupCallSessionRuntimeOptions,
  UseGroupCallSessionRuntimeResult,
} from "./session/session-types";

export function useGroupCallSessionRuntime({
  session,
  callId,
  userId,
  callHostUserId,
  deviceId,
  identityDhKeyPair,
  localAdvertisedMediaEncryptionMode,
  strictFrameEncryptionUnsupported,
  attachInitialStream,
  cleanupLocalMedia,
  resetLocalMediaState,
  resetMinimizedDock,
  dispatchStatus,
  setCallId,
  setAccessGranted,
  setError,
  setIsMinimized,
  resetCallDuration,
  setPinnedStageTileId,
  setActiveParticipantUserIds,
  setActiveParticipantDeviceIdsByUserId,
  setRemoteParticipantMediaModes,
  setRemoteMedia,
  setCallHostUserId,
  setLocalMediaKey,
  setSharedMediaKeyDeviceCount,
  setReceivedMediaKeyCount,
  localMediaKeyRef,
  sharedMediaKeyTargetsRef,
  receivedMediaKeysRef,
  mediaKeyRotationStateRef,
  mediaKeyDeliveryTrackerRef,
  sfuClientRef,
  startErrorMessage,
  mediaPermissionErrorMessage,
  frameUnsupportedStrictMessage,
  createInitialMediaKey,
  onClose,
}: UseGroupCallSessionRuntimeOptions): UseGroupCallSessionRuntimeResult {
  const callIdRef = useRef<string | null>(null);
  const didEndRef = useRef(false);
  const ownsServerCallRef = useRef(false);
  const joinedParticipantRef = useRef(false);
  const actionInFlightRef = useRef(false);
  const unloadCleanupSentRef = useRef(false);
  const activeStreamRef = useRef<MediaStream | null>(null);

  const performUnloadCleanup = useCallback(() => {
    if (unloadCleanupSentRef.current) {
      return;
    }

    const currentCallId = callIdRef.current;
    if (!currentCallId) {
      return;
    }

    unloadCleanupSentRef.current = true;
    const wasJoined = joinedParticipantRef.current;

    joinedParticipantRef.current = false;
    ownsServerCallRef.current = false;
    callIdRef.current = null;

    if (wasJoined) {
      api.leaveGroupCallKeepalive(currentCallId);
    }
  }, []);

  const endServerRoom = useCallback(
    async (
      nextStatus: "ended" | "missed" | "rejected" = "ended",
      options?: { force?: boolean }
    ) => {
      const currentCallId = callIdRef.current;
      const force = options?.force ?? false;
      if (
        !currentCallId ||
        didEndRef.current ||
        (!force && !ownsServerCallRef.current)
      ) {
        return;
      }

      didEndRef.current = true;
      joinedParticipantRef.current = false;
      ownsServerCallRef.current = false;
      callIdRef.current = null;
      try {
        await api.put<{ ok: boolean }>(`/calls/${currentCallId}/status`, {
          status: nextStatus,
        });
      } catch {
        // Best-effort cleanup for the server call record.
      }
    },
    []
  );

  const leaveCurrentCall = useCallback(async () => {
    const currentCallId = callIdRef.current;
    if (!currentCallId || !joinedParticipantRef.current) {
      return;
    }

    joinedParticipantRef.current = false;
    try {
      await api.leaveGroupCall(currentCallId);
    } catch {
      // Best-effort participant cleanup.
    }
  }, []);

  const handleLeave = useCallback(async () => {
    if (actionInFlightRef.current) {
      return;
    }
    actionInFlightRef.current = true;

    try {
      if (!callIdRef.current) {
        cleanupLocalMedia();
        resetMinimizedDock();
        onClose();
        return;
      }

      dispatchStatus({ type: "USER_LEAVE" });
      await leaveCurrentCall();
      cleanupLocalMedia();
      resetMinimizedDock();
      onClose();
    } finally {
      actionInFlightRef.current = false;
    }
  }, [
    cleanupLocalMedia,
    dispatchStatus,
    leaveCurrentCall,
    onClose,
    resetMinimizedDock,
  ]);

  const handleEndForEveryone = useCallback(async () => {
    if (actionInFlightRef.current) {
      return;
    }
    if (!userId || callHostUserId !== userId) {
      return;
    }
    actionInFlightRef.current = true;

    try {
      if (!callIdRef.current) {
        cleanupLocalMedia();
        resetMinimizedDock();
        onClose();
        return;
      }

      dispatchStatus({ type: "USER_END_FOR_EVERYONE" });
      await endServerRoom("ended", { force: true });
      cleanupLocalMedia();
      resetMinimizedDock();
      onClose();
    } finally {
      actionInFlightRef.current = false;
    }
  }, [
    cleanupLocalMedia,
    callHostUserId,
    dispatchStatus,
    endServerRoom,
    onClose,
    resetMinimizedDock,
    userId,
  ]);

  useGroupCallSessionLifecycle({
    session,
    userId,
    deviceId,
    identityDhKeyPair,
    localAdvertisedMediaEncryptionMode,
    strictFrameEncryptionUnsupported,
    attachInitialStream,
    cleanupLocalMedia,
    resetLocalMediaState,
    resetMinimizedDock,
    dispatchStatus,
    setCallId,
    setAccessGranted,
    setError,
    setIsMinimized,
    resetCallDuration,
    setPinnedStageTileId,
    setActiveParticipantUserIds,
    setActiveParticipantDeviceIdsByUserId,
    setRemoteParticipantMediaModes,
    setRemoteMedia,
    setCallHostUserId,
    setLocalMediaKey,
    setSharedMediaKeyDeviceCount,
    setReceivedMediaKeyCount,
    localMediaKeyRef,
    sharedMediaKeyTargetsRef,
    receivedMediaKeysRef,
    mediaKeyRotationStateRef,
    mediaKeyDeliveryTrackerRef,
    sfuClientRef,
    activeStreamRef,
    startErrorMessage,
    mediaPermissionErrorMessage,
    frameUnsupportedStrictMessage,
    createInitialMediaKey,
    callIdRef,
    didEndRef,
    ownsServerCallRef,
    joinedParticipantRef,
    actionInFlightRef,
    unloadCleanupSentRef,
    endServerRoom,
    leaveCurrentCall,
  });

  useGroupCallSessionSubscriptions({
    session,
    callId,
    deviceId,
    cleanupLocalMedia,
    resetMinimizedDock,
    dispatchStatus,
    setAccessGranted,
    setActiveParticipantUserIds,
    setActiveParticipantDeviceIdsByUserId,
    setRemoteParticipantMediaModes,
    setRemoteMedia,
    joinedParticipantRef,
    ownsServerCallRef,
    sfuClientRef,
    performUnloadCleanup,
    onClose,
  });

  useGroupCallPresenceHeartbeat(callId);

  return {
    handleLeave,
    handleEndForEveryone,
  };
}
