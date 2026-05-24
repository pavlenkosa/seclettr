/**
 * useGroupCallSessionLifecycle — session-scoped call bootstrap and rejoin orchestration.
 *
 * Owns:
 *   - The single useEffect that fires when a GroupCallPanelSession appears, which:
 *     resets all call state, runs the bootstrap sequence (runGroupCallBootstrap),
 *     and wires up the SFU rejoin handler (buildAttemptSfuRejoin)
 *   - Session run-ID bookkeeping to detect stale async chains (isCurrentSessionRun /
 *     abortIfStaleSessionRun)
 *   - Local-stream acquisition guard (ensureLocalStream) with media-permission error
 *   - Created-call and joined-participant cleanup helpers for abort paths
 *   - Session-level ref initialization (callIdRef, ownsServerCallRef, etc.)
 *
 * Does not own the session-level WS subscriptions (useGroupCallSessionSubscriptions),
 * local media controls (useGroupCallLocalMedia), or media-key runtime.
 *
 * Invariant: exactly one sessionRunId is "current" at a time; all async callbacks
 * check isCurrentSessionRun() before mutating shared state.
 */
import {
  useEffect,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import { api } from "@/lib/api";
import {
  type GroupCallRemoteMedia,
  type GroupSfuClient,
} from "@/calls/group/runtime/sfu";
import { buildParticipantDeviceIndex } from "@/calls/group/model/build-participant-device-index";
import type { GroupCallRuntimeMediaEncryptionMode } from "@/calls/group/runtime/media-key/media-encryption-negotiation";
import type {
  LocalGroupCallMediaKey,
  ReceivedGroupCallMediaKey,
} from "@/calls/group/runtime/media-key/media-key";
import type { GroupCallMediaKeyDeliveryTracker } from "@/calls/group/runtime/media-key/media-key-delivery";
import type { KeyPair } from "@seclettr/crypto";
import type {
  GroupCallPanelSession,
  GroupCallStatusAction,
} from "@/calls/group/model/group-call-types";
import type { MediaKeyRotationState } from "./session/session-types";
import {
  GroupCallSessionAbortError,
  runGroupCallBootstrap,
  type BootstrapContext,
  type BootstrapCallState,
} from "./session/bootstrap";
import {
  buildAttemptSfuRejoin,
  type RejoinContext,
  type RejoinState,
} from "./session/rejoin";
import type { CreateSfuClientWithRetryContext } from "./session/sfu-client";

const MAX_REJOIN_ATTEMPTS = 3;

interface UseGroupCallSessionLifecycleOptions {
  session: GroupCallPanelSession | null;
  userId: string | null;
  deviceId: string | null;
  identityDhKeyPair: KeyPair | null;
  localAdvertisedMediaEncryptionMode: GroupCallRuntimeMediaEncryptionMode;
  strictFrameEncryptionUnsupported: boolean;
  attachInitialStream: (stream: MediaStream) => void;
  cleanupLocalMedia: () => void;
  resetLocalMediaState: () => void;
  resetMinimizedDock: () => void;
  dispatchStatus: Dispatch<GroupCallStatusAction>;
  setCallId: Dispatch<SetStateAction<string | null>>;
  setAccessGranted: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setIsMinimized: Dispatch<SetStateAction<boolean>>;
  resetCallDuration: () => void;
  setPinnedStageTileId: Dispatch<SetStateAction<string | null>>;
  setActiveParticipantUserIds: Dispatch<SetStateAction<string[]>>;
  setActiveParticipantDeviceIdsByUserId: Dispatch<SetStateAction<Record<string, string[]>>>;
  setRemoteParticipantMediaModes: Dispatch<
    SetStateAction<Record<string, GroupCallRuntimeMediaEncryptionMode>>
  >;
  setRemoteMedia: Dispatch<SetStateAction<GroupCallRemoteMedia[]>>;
  setCallHostUserId: Dispatch<SetStateAction<string | null>>;
  setLocalMediaKey: Dispatch<SetStateAction<LocalGroupCallMediaKey | null>>;
  setSharedMediaKeyDeviceCount: Dispatch<SetStateAction<number>>;
  setReceivedMediaKeyCount: Dispatch<SetStateAction<number>>;
  localMediaKeyRef: MutableRefObject<LocalGroupCallMediaKey | null>;
  sharedMediaKeyTargetsRef: MutableRefObject<Set<string>>;
  receivedMediaKeysRef: MutableRefObject<Record<string, ReceivedGroupCallMediaKey>>;
  mediaKeyRotationStateRef: MutableRefObject<MediaKeyRotationState>;
  mediaKeyDeliveryTrackerRef: MutableRefObject<GroupCallMediaKeyDeliveryTracker | null>;
  sfuClientRef: MutableRefObject<GroupSfuClient | null>;
  activeStreamRef: MutableRefObject<MediaStream | null>;
  startErrorMessage: string;
  mediaPermissionErrorMessage: string;
  frameUnsupportedStrictMessage: string;
  createInitialMediaKey: () => LocalGroupCallMediaKey | null;
  callIdRef: MutableRefObject<string | null>;
  didEndRef: MutableRefObject<boolean>;
  ownsServerCallRef: MutableRefObject<boolean>;
  joinedParticipantRef: MutableRefObject<boolean>;
  actionInFlightRef: MutableRefObject<boolean>;
  unloadCleanupSentRef: MutableRefObject<boolean>;
  endServerRoom: (
    nextStatus?: "ended" | "missed" | "rejected",
    options?: { force?: boolean }
  ) => Promise<void>;
  leaveCurrentCall: () => Promise<void>;
}

export function useGroupCallSessionLifecycle({
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
}: UseGroupCallSessionLifecycleOptions) {
  const sessionRunIdRef = useRef(0);

  useEffect(() => {
    if (!session) {
      return;
    }
    if (!userId || !deviceId || !identityDhKeyPair) {
      dispatchStatus({ type: "SESSION_INIT_FAILED" });
      setError(startErrorMessage);
      return;
    }

    let cancelled = false;
    const sessionRunId = sessionRunIdRef.current + 1;
    sessionRunIdRef.current = sessionRunId;

    // Mutable state shared between bootstrap and rejoin closures
    const bootstrapState: BootstrapCallState = {
      createdCallId: null,
      createdHere: false,
      joinedHere: false,
      localStream: null,
    };

    const isCurrentSessionRun = () =>
      !cancelled && sessionRunIdRef.current === sessionRunId;

    const stopLocalStream = (stream: MediaStream | null) => {
      if (!stream) return;
      for (const track of stream.getTracks()) {
        track.stop();
      }
    };

    const endCreatedCall = async () => {
      if (!bootstrapState.createdCallId || !bootstrapState.createdHere) return;
      try {
        await api.put<{ ok: boolean }>(`/calls/${bootstrapState.createdCallId}/status`, {
          status: "ended",
        });
      } catch {
        // Best-effort cleanup for stale or aborted room creation.
      }
    };

    const leaveJoinedCall = async () => {
      if (!bootstrapState.createdCallId || !bootstrapState.joinedHere) return;
      try {
        await api.leaveGroupCall(bootstrapState.createdCallId);
      } catch {
        // Best-effort participant cleanup for stale or aborted joins.
      }
    };

    const abortIfStaleSessionRun = async (
      onAbort?: () => void | Promise<void>
    ) => {
      if (isCurrentSessionRun()) {
        return;
      }
      await onAbort?.();
      throw new GroupCallSessionAbortError();
    };

    const updateRemoteMediaIfCurrent = (nextParticipants: GroupCallRemoteMedia[]) => {
      if (isCurrentSessionRun()) {
        setRemoteMedia(nextParticipants);
      }
    };

    const syncParticipantDevices = (participantDevices: Awaited<
      ReturnType<typeof api.getGroupCallParticipantDevices>
    >) => {
      if (participantDevices.length === 0) {
        return;
      }
      setActiveParticipantDeviceIdsByUserId(
        buildParticipantDeviceIndex(participantDevices)
      );
    };

    const resolveInitialLocalMediaKey = () => (
      localAdvertisedMediaEncryptionMode === "required"
        ? localMediaKeyRef.current ?? null
        : null
    );

    const ensureLocalStream = async (): Promise<MediaStream> => {
      if (bootstrapState.localStream) {
        bootstrapState.localStream.getAudioTracks().forEach((track) => {
          track.enabled = true;
        });
        setAccessGranted(true);
        return bootstrapState.localStream;
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error(mediaPermissionErrorMessage);
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      bootstrapState.localStream = stream;
      stream.getAudioTracks().forEach((track) => {
        track.enabled = true;
      });
      attachInitialStream(stream);
      activeStreamRef.current = stream;
      setAccessGranted(true);
      return stream;
    };

    const failSessionStart = (cleanupMedia: boolean) => {
      dispatchStatus({ type: "SESSION_ERROR" });
      setError(startErrorMessage);
      if (cleanupMedia) {
        cleanupLocalMedia();
      }
    };

    const sfuClientCtx: CreateSfuClientWithRetryContext = {
      userId,
      deviceId,
      callType: session.callType,
      initialLocalMediaKey: resolveInitialLocalMediaKey(),
      mediaEncryptionMode: localAdvertisedMediaEncryptionMode,
      onRemoteMediaUpdate: updateRemoteMediaIfCurrent,
      startErrorMessage,
      abortIfStaleSessionRun,
    };

    const rejoinState: RejoinState = {
      rejoinAttempts: 0,
      rejoinTimerId: null,
    };

    const rejoinCtx: RejoinContext = {
      userId,
      groupId: session.groupId,
      sfuClientCtx,
      sfuClientRef,
      activeStreamRef,
      callIdRef,
      joinedParticipantRef,
      ownsServerCallRef,
      isCurrentSessionRun,
      abortIfStaleSessionRun,
      syncParticipantDevices,
      failSessionStart,
      dispatchStatus,
      setCallId,
      setCallHostUserId,
      setActiveParticipantUserIds,
    };

    const attemptSfuRejoin = buildAttemptSfuRejoin(rejoinCtx, rejoinState, MAX_REJOIN_ATTEMPTS);

    const bootstrapCtx: BootstrapContext = {
      userId,
      groupId: session.groupId,
      callType: session.callType,
      sfuClientCtx,
      sfuClientRef,
      callIdRef,
      joinedParticipantRef,
      ownsServerCallRef,
      isCurrentSessionRun,
      abortIfStaleSessionRun,
      syncParticipantDevices,
      stopLocalStream,
      ensureLocalStream,
      endCreatedCall,
      leaveJoinedCall,
      cleanupLocalMedia,
      leaveCurrentCall,
      endServerRoom,
      dispatchStatus,
      setCallId,
      setCallHostUserId,
      setAccessGranted,
      setError,
      setActiveParticipantUserIds,
      setActiveParticipantDeviceIdsByUserId,
      setRemoteParticipantMediaModes,
      setRemoteMedia,
      startErrorMessage,
      mediaPermissionErrorMessage,
      frameUnsupportedStrictMessage,
      strictFrameEncryptionUnsupported,
      attemptSfuRejoin,
    };

    dispatchStatus({ type: "SESSION_START" });
    setCallId(null);
    setAccessGranted(false);
    setError(null);
    setIsMinimized(false);
    resetCallDuration();
    setPinnedStageTileId(null);
    resetMinimizedDock();
    setActiveParticipantUserIds([]);
    setActiveParticipantDeviceIdsByUserId({});
    setRemoteParticipantMediaModes({});
    setRemoteMedia([]);
    setCallHostUserId(session.hostUserId ?? null);
    resetLocalMediaState();

    const nextLocalMediaKey = createInitialMediaKey();
    setLocalMediaKey(nextLocalMediaKey);
    localMediaKeyRef.current = nextLocalMediaKey;
    setSharedMediaKeyDeviceCount(0);
    setReceivedMediaKeyCount(0);

    callIdRef.current = null;
    didEndRef.current = false;
    ownsServerCallRef.current = false;
    joinedParticipantRef.current = false;
    actionInFlightRef.current = false;
    unloadCleanupSentRef.current = false;
    sharedMediaKeyTargetsRef.current = new Set();
    receivedMediaKeysRef.current = {};
    mediaKeyRotationStateRef.current = {
      lastRotatedAtMs: null,
      participantFingerprint: null,
    };
    mediaKeyDeliveryTrackerRef.current?.clear();
    mediaKeyDeliveryTrackerRef.current = null;
    cleanupLocalMedia();

    void runGroupCallBootstrap(bootstrapCtx, bootstrapState);

    return () => {
      cancelled = true;
      if (sessionRunIdRef.current === sessionRunId) {
        sessionRunIdRef.current += 1;
      }
      if (rejoinState.rejoinTimerId !== null) {
        clearTimeout(rejoinState.rejoinTimerId);
        rejoinState.rejoinTimerId = null;
      }
      activeStreamRef.current = null;
      cleanupLocalMedia();
      void leaveCurrentCall();
    };
  }, [
    attachInitialStream,
    cleanupLocalMedia,
    createInitialMediaKey,
    deviceId,
    endServerRoom,
    frameUnsupportedStrictMessage,
    identityDhKeyPair,
    leaveCurrentCall,
    localAdvertisedMediaEncryptionMode,
    localMediaKeyRef,
    mediaKeyDeliveryTrackerRef,
    mediaKeyRotationStateRef,
    mediaPermissionErrorMessage,
    receivedMediaKeysRef,
    resetLocalMediaState,
    resetMinimizedDock,
    session,
    setAccessGranted,
    setActiveParticipantDeviceIdsByUserId,
    setActiveParticipantUserIds,
    resetCallDuration,
    setCallHostUserId,
    setCallId,
    setError,
    setIsMinimized,
    setLocalMediaKey,
    setPinnedStageTileId,
    setReceivedMediaKeyCount,
    setRemoteMedia,
    setRemoteParticipantMediaModes,
    setSharedMediaKeyDeviceCount,
    dispatchStatus,
    sharedMediaKeyTargetsRef,
    sfuClientRef,
    activeStreamRef,
    startErrorMessage,
    strictFrameEncryptionUnsupported,
    actionInFlightRef,
    callIdRef,
    didEndRef,
    joinedParticipantRef,
    ownsServerCallRef,
    unloadCleanupSentRef,
    userId,
  ]);
}
