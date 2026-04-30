import {
  useEffect,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import { api } from "@/lib/api";
import {
  startGroupSfuClient,
  type GroupCallRemoteMedia,
  type GroupSfuClient,
} from "@/calls/group/runtime/sfu";
import { buildParticipantDeviceIndex, isMediaCaptureError, resolveErrorMessage } from "@/calls/group/runtime/runtime-utils";
import type { GroupCallRuntimeMediaEncryptionMode } from "@/calls/group/runtime/group-call/media-encryption-negotiation";
import type {
  LocalGroupCallMediaKey,
  ReceivedGroupCallMediaKey,
} from "@/calls/group/runtime/group-call/media-key";
import type { GroupCallMediaKeyDeliveryTracker } from "@/calls/group/runtime/group-call/media-key-delivery";
import type { KeyPair } from "@seclettr/crypto";
import type {
  GroupCallPanelSession,
  GroupCallStatusAction,
} from "@/calls/group/model/group-call-types";
import type { MediaKeyRotationState } from "./group-call-session-types";

class GroupCallSessionAbortError extends Error {
  constructor() {
    super("Group call session run is stale");
  }
}

function readApiErrorStatus(error: unknown): number | null {
  if (typeof error !== "object" || error === null) {
    return null;
  }
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : null;
}

function isRecoverableGroupCallBootstrapError(error: unknown): boolean {
  const status = readApiErrorStatus(error);
  if (status === 401 || status === 403 || status === 404 || status === 409) {
    return true;
  }
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message.toLowerCase();
  return message.includes("call not found")
    || message.includes("forbidden")
    || message.includes("missing access token")
    || message.includes("network");
}

const INITIAL_CALL_BOOTSTRAP_ATTEMPTS = 2;

type CreateGroupCallResponse = {
  callId: string;
  created?: boolean;
  callerUserId?: string;
};

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
    let createdCallId: string | null = null;
    let createdHere = false;
    let joinedHere = false;
    let localStream: MediaStream | null = null;
    const isCurrentSessionRun = () =>
      !cancelled && sessionRunIdRef.current === sessionRunId;
    const stopLocalStream = (stream: MediaStream | null) => {
      if (!stream) return;
      for (const track of stream.getTracks()) {
        track.stop();
      }
    };
    const endCreatedCall = async () => {
      if (!createdCallId || !createdHere) return;
      try {
        await api.put<{ ok: boolean }>(`/calls/${createdCallId}/status`, {
          status: "ended",
        });
      } catch {
        // Best-effort cleanup for stale or aborted room creation.
      }
    };
    const leaveJoinedCall = async () => {
      if (!createdCallId || !joinedHere) return;
      try {
        await api.leaveGroupCall(createdCallId);
      } catch {
        // Best-effort participant cleanup for stale or aborted joins.
      }
    };
    const resolveInitialLocalMediaKey = () => (
      localAdvertisedMediaEncryptionMode === "required"
        ? localMediaKeyRef.current ?? null
        : null
    );
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
    const createSfuClient = (
      roomId: string,
      stream: MediaStream,
      onTransportFailed: () => void
    ) => startGroupSfuClient({
      roomId,
      userId,
      deviceId,
      callType: session.callType,
      localStream: stream,
      initialLocalMediaKey: resolveInitialLocalMediaKey(),
      mediaEncryptionMode: localAdvertisedMediaEncryptionMode,
      onRemoteMediaUpdate: updateRemoteMediaIfCurrent,
      onTransportFailed,
    });
    const INITIAL_SFU_START_ATTEMPTS = 3;
    const wait = (delayMs: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    const createSfuClientWithRetry = async (
      roomId: string,
      stream: MediaStream,
      onTransportFailed: () => void
    ) => {
      let lastError: unknown = null;
      for (let attempt = 1; attempt <= INITIAL_SFU_START_ATTEMPTS; attempt += 1) {
        try {
          return await createSfuClient(roomId, stream, onTransportFailed);
        } catch (caughtError) {
          lastError = caughtError;
          if (attempt >= INITIAL_SFU_START_ATTEMPTS) {
            break;
          }
          await abortIfStaleSessionRun();
          await wait(350 * attempt);
        }
      }
      throw lastError ?? new Error(startErrorMessage);
    };
    const MAX_REJOIN_ATTEMPTS = 3;
    let rejoinAttempts = 0;

    const failSessionStart = (cleanupMedia: boolean) => {
      dispatchStatus({ type: "SESSION_ERROR" });
      setError(startErrorMessage);
      if (cleanupMedia) {
        cleanupLocalMedia();
      }
    };

    const attemptSfuRejoin = () => {
      if (!isCurrentSessionRun()) return;
      if (rejoinAttempts >= MAX_REJOIN_ATTEMPTS) {
        failSessionStart(true);
        return;
      }
      rejoinAttempts += 1;
      dispatchStatus({ type: "RECONNECT_START" });
      const delayMs = Math.pow(2, rejoinAttempts - 1) * 1000;
      setTimeout(() => {
        runSfuRejoinAttempt();
      }, delayMs);
    };

    const resolveActiveRejoinCallId = async (
      fallbackCallId: string
    ): Promise<string | null> => {
      try {
        const [participants, participantDevices] = await Promise.all([
          api.joinGroupCall(fallbackCallId),
          api.getGroupCallParticipantDevices(fallbackCallId).catch(() => []),
        ]);
        await abortIfStaleSessionRun();
        joinedParticipantRef.current = true;
        setActiveParticipantUserIds(
          participants.map((participant) => participant.userId)
        );
        syncParticipantDevices(participantDevices);
        return fallbackCallId;
      } catch (joinError) {
        const status = readApiErrorStatus(joinError);
        if (status !== 401 && status !== 403 && status !== 404) {
          throw joinError;
        }
      }

      const nextActiveCall = await api.getActiveGroupCall(session.groupId);
      await abortIfStaleSessionRun();
      if (!nextActiveCall) {
        return null;
      }

      const [participants, participantDevices] = await Promise.all([
        api.joinGroupCall(nextActiveCall.callId),
        api.getGroupCallParticipantDevices(nextActiveCall.callId).catch(() => []),
      ]);
      await abortIfStaleSessionRun();
      joinedParticipantRef.current = true;
      callIdRef.current = nextActiveCall.callId;
      setCallId(nextActiveCall.callId);
      setCallHostUserId(nextActiveCall.callerUserId);
      ownsServerCallRef.current = nextActiveCall.callerUserId === userId;
      setActiveParticipantUserIds(
        participants.map((participant) => participant.userId)
      );
      syncParticipantDevices(participantDevices);
      return nextActiveCall.callId;
    };

    const runSfuRejoinAttempt = async () => {
      if (!isCurrentSessionRun()) return;
      const currentStream = activeStreamRef.current;
      const fallbackCallId = callIdRef.current;
      if (!currentStream || !fallbackCallId) {
        failSessionStart(false);
        return;
      }
      sfuClientRef.current?.close();
      sfuClientRef.current = null;
      try {
        const resolvedCallId = await resolveActiveRejoinCallId(fallbackCallId);
        if (!resolvedCallId) {
          failSessionStart(true);
          return;
        }
        const nextSfuClient = await createSfuClient(
          resolvedCallId,
          currentStream,
          attemptSfuRejoin
        );
        if (!isCurrentSessionRun()) {
          nextSfuClient.close();
          return;
        }
        sfuClientRef.current = nextSfuClient;
        rejoinAttempts = 0;
        dispatchStatus({ type: "SESSION_READY" });
      } catch {
        if (isCurrentSessionRun()) {
          attemptSfuRejoin();
        }
      }
    };
    const handleStartGroupCallFailure = async (error: unknown) => {
      if (!isCurrentSessionRun()) {
        stopLocalStream(localStream);
        await leaveJoinedCall();
        await endCreatedCall();
        return;
      }
      cleanupLocalMedia();
      await leaveCurrentCall();

      if (createdCallId && createdHere) {
        callIdRef.current = createdCallId;
        await endServerRoom("ended");
      }

      if (isCurrentSessionRun()) {
        dispatchStatus({ type: "SESSION_ERROR" });
        setAccessGranted(false);
        setError(
          resolveErrorMessage(
            error,
            isMediaCaptureError(error)
              ? mediaPermissionErrorMessage
              : startErrorMessage
          )
        );
      }
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

    const ensureLocalStream = async (): Promise<MediaStream> => {
      if (localStream) {
        localStream.getAudioTracks().forEach((track) => {
          track.enabled = true;
        });
        setAccessGranted(true);
        return localStream;
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error(mediaPermissionErrorMessage);
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      localStream = stream;
      stream.getAudioTracks().forEach((track) => {
        track.enabled = true;
      });
      attachInitialStream(stream);
      activeStreamRef.current = stream;
      setAccessGranted(true);
      return stream;
    };

    const startGroupCall = async () => {
      if (strictFrameEncryptionUnsupported) {
        await handleStartGroupCallFailure(new Error(frameUnsupportedStrictMessage));
        return;
      }

      for (
        let bootstrapAttempt = 1;
        bootstrapAttempt <= INITIAL_CALL_BOOTSTRAP_ATTEMPTS;
        bootstrapAttempt += 1
      ) {
        try {
          const existing = await api.getActiveGroupCall(session.groupId);
          await abortIfStaleSessionRun();
          let nextHostUserId = existing?.callerUserId ?? session.hostUserId ?? userId;
          let resolvedCallId = existing?.callId ?? null;
          let serverCreatedCall = existing === null;
          if (!resolvedCallId) {
            const created = await api.post<CreateGroupCallResponse>(
              "/calls",
              {
                groupId: session.groupId,
                callType: session.callType,
              }
            );
            resolvedCallId = created.callId;
            serverCreatedCall = created.created ?? true;
            if (created.callerUserId) {
              nextHostUserId = created.callerUserId;
            } else if (!serverCreatedCall) {
              const activeCall = await api.getActiveGroupCall(session.groupId);
              await abortIfStaleSessionRun();
              if (activeCall?.callId === resolvedCallId) {
                nextHostUserId = activeCall.callerUserId;
              }
            }
          }
          createdCallId = resolvedCallId;
          createdHere = existing === null && serverCreatedCall;
          joinedHere = false;
          await abortIfStaleSessionRun(endCreatedCall);

          ownsServerCallRef.current = createdHere;
          setCallHostUserId(nextHostUserId);
          setCallId(resolvedCallId);
          callIdRef.current = resolvedCallId;

          const stream = await ensureLocalStream();
          await abortIfStaleSessionRun(async () => {
            stopLocalStream(stream);
            await endCreatedCall();
          });

          const [participants, participantDevices] = await Promise.all([
            api.joinGroupCall(resolvedCallId),
            api.getGroupCallParticipantDevices(resolvedCallId).catch(() => []),
          ]);
          joinedHere = true;
          await abortIfStaleSessionRun(async () => {
            await leaveJoinedCall();
            stopLocalStream(stream);
            await endCreatedCall();
          });
          joinedParticipantRef.current = true;
          setActiveParticipantUserIds(
            participants.map((participant) => participant.userId)
          );
          syncParticipantDevices(participantDevices);

          try {
            await api.put<{ ok: boolean }>(`/calls/${resolvedCallId}/status`, {
              status: "active",
            });
          } catch {
            // Best-effort room state update.
          }

          await abortIfStaleSessionRun(async () => {
            await leaveJoinedCall();
            stopLocalStream(stream);
            await endCreatedCall();
          });

          const sfuClient = await createSfuClientWithRetry(
            resolvedCallId,
            stream,
            attemptSfuRejoin
          );
          await abortIfStaleSessionRun(() => {
            sfuClient.close();
          });
          sfuClientRef.current = sfuClient;

          await abortIfStaleSessionRun();
          dispatchStatus({ type: "SESSION_READY" });
          return;
        } catch (error) {
          if (error instanceof GroupCallSessionAbortError) {
            return;
          }
          const canRetryBootstrap =
            bootstrapAttempt < INITIAL_CALL_BOOTSTRAP_ATTEMPTS
            && isRecoverableGroupCallBootstrapError(error);
          if (!canRetryBootstrap) {
            await handleStartGroupCallFailure(error);
            return;
          }

          sfuClientRef.current?.close();
          sfuClientRef.current = null;
          await leaveJoinedCall();
          await endCreatedCall();

          createdCallId = null;
          createdHere = false;
          joinedHere = false;
          joinedParticipantRef.current = false;
          ownsServerCallRef.current = false;
          callIdRef.current = null;
          setCallId(null);
          setActiveParticipantUserIds([]);
          setActiveParticipantDeviceIdsByUserId({});
          setRemoteParticipantMediaModes({});
          setRemoteMedia([]);
          setAccessGranted(localStream !== null);
          await abortIfStaleSessionRun();
          await wait(250 * bootstrapAttempt);
        }
      }
    };

    startGroupCall();

    return () => {
      cancelled = true;
      if (sessionRunIdRef.current === sessionRunId) {
        sessionRunIdRef.current += 1;
      }
      activeStreamRef.current = null;
      cleanupLocalMedia();
      leaveCurrentCall();
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
