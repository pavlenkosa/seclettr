/**
 * useGroupCallPanelRuntime — composition root for the group call runtime.
 *
 * This hook does not contain business logic. It wires all group-call sub-hooks
 * and returns the complete runtime surface consumed by GroupCallPanel.
 *
 * Ownership map:
 *   Session state     → useGroupCallSync (REST + WS active call sync)
 *   Local media       → useGroupCallLocalMedia
 *   SFU session       → useGroupCallSessionRuntime → startGroupSfuClient
 *   WS subscriptions  → useGroupCallSessionSubscriptions
 *   Media key runtime → useGroupCallMediaKeyRuntime
 *                         → useGroupCallMediaKeyExchange
 *                         → useGroupCallMediaKeyRotation
 *                         → useGroupCallLocalMediaKeySync
 *   Audio activity    → useGroupCallAudioActivity
 *   Debug snapshots   → useGroupCallDevDebug (dev only, gated by localStorage flag)
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useI18n } from "@/i18n";
import {
  createLocalGroupCallMediaKey,
  type LocalGroupCallMediaKey,
  type ReceivedGroupCallMediaKey,
} from "@/calls/group/runtime/media-key/media-key";
import { type GroupCallMediaKeyDeliveryTracker } from "@/calls/group/runtime/media-key/media-key-delivery";
import {
  resolveEffectiveGroupMediaEncryptionMode,
  resolveLocalGroupCallMediaEncryptionDecision,
  type GroupCallRuntimeMediaEncryptionMode,
} from "@/calls/group/runtime/media-key/media-encryption-negotiation";
import { type GroupCallRemoteMedia, type GroupSfuClient } from "@/calls/group/runtime/sfu";
import { useAuthStore } from "@/stores/auth";
import { resolveCallDurationSeconds } from "@/calls/shared/model/call-duration";
import { useSecuritySettings } from "@/ui-settings";
import {
  groupCallStatusReducer,
  type GroupCallPanelSession,
  type GroupCallStatus,
} from "@/calls/group/model/group-call-types";
import { useGroupCallLocalMedia } from "./useGroupCallLocalMedia";
import { useGroupCallMediaKeyRuntime } from "./useGroupCallMediaKeyRuntime";
import { useGroupCallSessionRuntime } from "./useGroupCallSessionRuntime";
import type { MediaKeyRotationState } from "./session/session-types";
import type { VideoResolution } from "@/calls/shared/presentation/CallDevicePicker";

interface UseGroupCallPanelRuntimeOptions {
  session: GroupCallPanelSession | null;
  onClose: () => void;
  resetMinimizedDock: () => void;
  setIsMinimized: React.Dispatch<React.SetStateAction<boolean>>;
  setPinnedStageTileId: React.Dispatch<React.SetStateAction<string | null>>;
}


export interface UseGroupCallPanelRuntimeResult {
  deviceId: string | null;
  userId: string | null;
  username: string | null;
  activeGroupId: string | null;
  status: GroupCallStatus;
  callId: string | null;
  accessGranted: boolean;
  error: string | null;
  callDurationSeconds: number;
  callDurationStartedAtMs: number | null;
  activeParticipantUserIds: string[];
  activeParticipantDeviceIdsByUserId: Record<string, string[]>;
  remoteMedia: GroupCallRemoteMedia[];
  callHostUserId: string | null;
  localMediaKey: LocalGroupCallMediaKey | null;
  sharedMediaKeyDeviceCount: number;
  receivedMediaKeyCount: number;
  remoteParticipantMediaModes: Record<string, GroupCallRuntimeMediaEncryptionMode>;
  localRequestedMediaEncryptionMode: GroupCallRuntimeMediaEncryptionMode;
  localAdvertisedMediaEncryptionMode: GroupCallRuntimeMediaEncryptionMode;
  strictFrameEncryptionUnsupported: boolean;
  effectiveMediaEncryptionMode: GroupCallRuntimeMediaEncryptionMode;
  effectiveFrameEncryptionEnabled: boolean;
  expectedRemoteDeviceIds: Set<string>;
  sfuClientRef: React.MutableRefObject<GroupSfuClient | null>;
  localStreamRef: React.MutableRefObject<MediaStream | null>;
  localScreenStreamRef: React.MutableRefObject<MediaStream | null>;
  localStream: MediaStream | null;
  localScreenStream: MediaStream | null;
  isLocalAudioMuted: boolean;
  isVideoSwitching: boolean;
  isScreenSwitching: boolean;
  isLocalScreenSharing: boolean;
  selectedVideoResolution: VideoResolution;
  selectedScreenResolution: VideoResolution;
  handleToggleMute: () => void;
  handleToggleVideo: () => Promise<void>;
  handleToggleScreenShare: () => Promise<void>;
  handleSwitchMic: (deviceId: string) => Promise<void>;
  handleSwitchCamera: (deviceId: string) => Promise<void>;
  handleSelectVideoResolution: (resolution: VideoResolution) => Promise<void>;
  handleSelectScreenResolution: (resolution: VideoResolution) => void;
  handleLeave: () => Promise<void>;
  handleEndForEveryone: () => Promise<void>;
}

export function useGroupCallPanelRuntime({
  session,
  onClose,
  resetMinimizedDock,
  setIsMinimized,
  setPinnedStageTileId,
}: UseGroupCallPanelRuntimeOptions): UseGroupCallPanelRuntimeResult {
  const { t } = useI18n();
  const { callSecurityMode } = useSecuritySettings();
  const {
    deviceId,
    identityDhKeyPair,
    userId,
    username,
  } = useAuthStore(useShallow((state) => ({
    deviceId: state.deviceId,
    identityDhKeyPair: state.identityDhKeyPair,
    userId: state.userId,
    username: state.username,
  })));
  const activeGroupId = session?.groupId ?? null;

  const localMediaEncryptionDecision = useMemo(
    () => resolveLocalGroupCallMediaEncryptionDecision(callSecurityMode),
    [callSecurityMode]
  );
  const localRequestedMediaEncryptionMode = localMediaEncryptionDecision.requestedMode;
  const localAdvertisedMediaEncryptionMode = localMediaEncryptionDecision.advertisedMode;
  const strictFrameEncryptionUnsupported = localMediaEncryptionDecision.strictUnsupported;

  const [status, dispatchStatus] = useReducer(groupCallStatusReducer, "idle" as GroupCallStatus);
  const [callId, setCallId] = useState<string | null>(null);
  const [accessGranted, setAccessGranted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [callDurationSeconds, setCallDurationSeconds] = useState(0);
  const [callDurationStartedAtMs, setCallDurationStartedAtMs] = useState<number | null>(null);
  const callDurationStartedAtRef = useRef<number | null>(null);
  const [activeParticipantUserIds, setActiveParticipantUserIds] = useState<string[]>([]);
  const [activeParticipantDeviceIdsByUserId, setActiveParticipantDeviceIdsByUserId] = useState<Record<string, string[]>>({});
  const [remoteMedia, setRemoteMedia] = useState<GroupCallRemoteMedia[]>([]);
  const [callHostUserId, setCallHostUserId] = useState<string | null>(null);
  const [localMediaKey, setLocalMediaKey] = useState<LocalGroupCallMediaKey | null>(null);
  const [sharedMediaKeyDeviceCount, setSharedMediaKeyDeviceCount] = useState(0);
  const [receivedMediaKeyCount, setReceivedMediaKeyCount] = useState(0);
  const [remoteParticipantMediaModes, setRemoteParticipantMediaModes] = useState<
    Record<string, GroupCallRuntimeMediaEncryptionMode>
  >({});

  const startErrorMessage = t("group.call.error.startFailed");
  const mediaPermissionErrorMessage = t("group.call.error.permissionFailed");
  const cameraToggleError = t("group.call.error.videoFailed");
  const screenToggleError = t("group.call.error.screenFailed");
  const sfuClientRef = useRef<GroupSfuClient | null>(null);
  const activeStreamRef = useRef<MediaStream | null>(null);
  const sharedMediaKeyTargetsRef = useRef<Set<string>>(new Set());
  const receivedMediaKeysRef = useRef<Record<string, ReceivedGroupCallMediaKey>>({});
  const localMediaKeyRef = useRef<LocalGroupCallMediaKey | null>(null);
  const mediaKeyDeliveryTrackerRef = useRef<GroupCallMediaKeyDeliveryTracker | null>(null);
  const mediaKeyRotationStateRef = useRef<MediaKeyRotationState>({
    lastRotatedAtMs: null,
    participantFingerprint: null,
  });

  const expectedRemoteDeviceIds = useMemo(() => {
    const result = new Set<string>();
    for (const deviceIds of Object.values(activeParticipantDeviceIdsByUserId)) {
      for (const participantDeviceId of deviceIds) {
        if (participantDeviceId === deviceId) continue;
        result.add(participantDeviceId);
      }
    }
    return result;
  }, [activeParticipantDeviceIdsByUserId, deviceId]);

  const {
    localStream,
    localScreenStream,
    isLocalAudioMuted,
    isVideoSwitching,
    isScreenSwitching,
    isLocalScreenSharing,
    selectedVideoResolution,
    selectedScreenResolution,
    localStreamRef,
    localScreenStreamRef,
    attachInitialStream,
    resetLocalMediaState,
    cleanupLocalMedia,
    handleToggleMute,
    handleToggleVideo,
    handleToggleScreenShare,
    handleSwitchMic,
    handleSwitchCamera,
    handleSelectVideoResolution,
    handleSelectScreenResolution,
  } = useGroupCallLocalMedia({
    status,
    sfuClientRef,
    setError,
    mediaPermissionError: mediaPermissionErrorMessage,
    cameraToggleError,
    screenToggleError,
  });

  const effectiveMediaEncryptionMode = useMemo(() => {
    const explicitRemoteModes = Object.values(remoteParticipantMediaModes);
    const negotiatedRemoteModes = expectedRemoteDeviceIds.size > 0
      ? [...expectedRemoteDeviceIds].map(
        (participantDeviceId) => remoteParticipantMediaModes[participantDeviceId] ?? null
      )
      : explicitRemoteModes;
    return resolveEffectiveGroupMediaEncryptionMode(
      localAdvertisedMediaEncryptionMode,
      negotiatedRemoteModes,
      {
        treatUnknownRemoteAsOff: localRequestedMediaEncryptionMode === "best-effort",
      }
    );
  }, [
    expectedRemoteDeviceIds,
    localAdvertisedMediaEncryptionMode,
    localRequestedMediaEncryptionMode,
    remoteParticipantMediaModes,
  ]);

  const effectiveFrameEncryptionEnabled = effectiveMediaEncryptionMode !== "off";

  const acknowledgedExpectedRemoteDeviceCount = useMemo(() => {
    if (sharedMediaKeyDeviceCount === 0 || expectedRemoteDeviceIds.size === 0) {
      return 0;
    }

    let acknowledgedCount = 0;
    for (const participantDeviceId of expectedRemoteDeviceIds) {
      if (sharedMediaKeyTargetsRef.current.has(participantDeviceId)) {
        acknowledgedCount += 1;
      }
    }
    return acknowledgedCount;
  }, [expectedRemoteDeviceIds, sharedMediaKeyDeviceCount]);


  useEffect(() => {
    if (status === "ready") {
      if (callDurationStartedAtRef.current === null) {
        const nowMs = Date.now();
        callDurationStartedAtRef.current = nowMs;
        setCallDurationStartedAtMs(nowMs);
      }
      return;
    }

    const startedAtMs = callDurationStartedAtRef.current;
    if (startedAtMs === null) {
      return;
    }

    setCallDurationSeconds((current) => resolveCallDurationSeconds({
      baseSeconds: current,
      startedAtMs,
    }));
    callDurationStartedAtRef.current = null;
    setCallDurationStartedAtMs(null);
  }, [status]);

  const resetCallDuration = useCallback(() => {
    callDurationStartedAtRef.current = null;
    setCallDurationStartedAtMs(null);
    setCallDurationSeconds(0);
  }, []);

  const createInitialMediaKey = useCallback(
    () => (localAdvertisedMediaEncryptionMode === "off" ? null : createLocalGroupCallMediaKey()),
    [localAdvertisedMediaEncryptionMode]
  );

  const frameUnsupportedStrictMessage = t("group.call.error.frameUnsupportedStrict");
  const mediaKeyFallbackMessage = t("group.call.error.mediaKeyFallback");

  const { handleLeave, handleEndForEveryone } = useGroupCallSessionRuntime({
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
    activeStreamRef,
    startErrorMessage,
    mediaPermissionErrorMessage,
    frameUnsupportedStrictMessage,
    createInitialMediaKey,
    onClose,
  });

  useGroupCallMediaKeyRuntime({
    session,
    status,
    callId,
    userId,
    deviceId,
    identityDhKeyPair,
    localRequestedMediaEncryptionMode,
    localAdvertisedMediaEncryptionMode,
    effectiveMediaEncryptionMode,
    effectiveFrameEncryptionEnabled,
    activeParticipantUserIds,
    activeParticipantDeviceIdsByUserId,
    expectedRemoteDeviceIds,
    acknowledgedExpectedRemoteDeviceCount,
    localMediaKey,
    setLocalMediaKey,
    setSharedMediaKeyDeviceCount,
    setReceivedMediaKeyCount,
    setError,
    localMediaKeyRef,
    sharedMediaKeyTargetsRef,
    receivedMediaKeysRef,
    mediaKeyRotationStateRef,
    mediaKeyDeliveryTrackerRef,
    sfuClientRef,
    mediaKeyFallbackMessage,
  });

  return {
    deviceId,
    userId,
    username,
    activeGroupId,
    status,
    callId,
    accessGranted,
    error,
    callDurationSeconds,
    callDurationStartedAtMs,
    activeParticipantUserIds,
    activeParticipantDeviceIdsByUserId,
    remoteMedia,
    callHostUserId,
    localMediaKey,
    sharedMediaKeyDeviceCount,
    receivedMediaKeyCount,
    remoteParticipantMediaModes,
    localRequestedMediaEncryptionMode,
    localAdvertisedMediaEncryptionMode,
    strictFrameEncryptionUnsupported,
    effectiveMediaEncryptionMode,
    effectiveFrameEncryptionEnabled,
    expectedRemoteDeviceIds,
    sfuClientRef,
    localStreamRef,
    localScreenStreamRef,
    localStream,
    localScreenStream,
    isLocalAudioMuted,
    isVideoSwitching,
    isScreenSwitching,
    isLocalScreenSharing,
    selectedVideoResolution,
    selectedScreenResolution,
    handleToggleMute,
    handleToggleVideo,
    handleToggleScreenShare,
    handleSwitchMic,
    handleSwitchCamera,
    handleSelectVideoResolution,
    handleSelectScreenResolution,
    handleLeave,
    handleEndForEveryone,
  };
}
