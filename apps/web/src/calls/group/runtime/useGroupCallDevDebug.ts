/**
 * useGroupCallDevDebug — dev-only global debug utilities for the group call runtime.
 *
 * Owns:
 *   - window.__scGetCallDebugSnapshot() — returns a full async snapshot of call state
 *   - window.__scDumpCallDebug() — logs the snapshot to the browser console
 *   - window.__scSetCallDebugEnabled(enabled) — toggles call-media debug logging
 *   - window.__scIsCallDebugEnabled() — returns current debug logging state
 *   - Lifecycle-aware snapshot including session, encryption, participants, local/remote
 *     media track details, and the SFU client debug snapshot
 *   - Auto-cleanup of window helpers on unmount
 *
 * In production builds (import.meta.env.DEV === false) this hook is replaced with
 * a no-op function and none of the above is registered.
 */
import { useCallback, useEffect, useRef, type MutableRefObject } from "react";
import type { GroupCallRuntimeMediaEncryptionMode } from "@/calls/group/runtime/media-key/media-encryption-negotiation";
import type { GroupCallRemoteMedia, GroupSfuClient } from "@/calls/group/runtime/sfu";
import {
  readCallMediaDebugEnabled,
  snapshotTrack,
  writeCallMediaDebugEnabled,
} from "@/calls/shared/media/call-media-debug";
import type { GroupCallPanelSession, GroupCallStatus } from "@/calls/group/model/group-call-types";
import {
  GROUP_CALL_LIFECYCLE_DEFINITIONS,
  canGroupCallLifecycleAction,
  resolveGroupCallLifecycleState,
} from "@/calls/group/model/group-call-lifecycle";
import { logger } from "@/lib/logger.js";

type CallDebugWindow = Window & {
  __scGetCallDebugSnapshot?: () => Promise<Record<string, unknown> | null>;
  __scDumpCallDebug?: () => Promise<void>;
  __scSetCallDebugEnabled?: (enabled: boolean) => void;
  __scIsCallDebugEnabled?: () => boolean;
};

export interface UseGroupCallDevDebugOptions {
  session: GroupCallPanelSession | null;
  status: GroupCallStatus;
  callId: string | null;
  accessGranted: boolean;
  isVideoSwitching: boolean;
  isScreenSwitching: boolean;
  callHostUserId: string | null;
  userId: string | null;
  deviceId: string | null;
  localStreamRef: MutableRefObject<MediaStream | null>;
  localScreenStreamRef: MutableRefObject<MediaStream | null>;
  remoteMedia: GroupCallRemoteMedia[];
  activeParticipantUserIds: string[];
  activeParticipantDeviceIdsByUserId: Record<string, string[]>;
  remoteParticipantMediaModes: Record<string, GroupCallRuntimeMediaEncryptionMode>;
  localRequestedMediaEncryptionMode: GroupCallRuntimeMediaEncryptionMode;
  localAdvertisedMediaEncryptionMode: GroupCallRuntimeMediaEncryptionMode;
  effectiveMediaEncryptionMode: GroupCallRuntimeMediaEncryptionMode;
  localMediaKey: { keyId: string; epoch: number; algorithm: string } | null;
  sharedMediaKeyDeviceCount: number;
  receivedMediaKeyCount: number;
  expectedRemoteDeviceIds: Set<string>;
  sfuClientRef: MutableRefObject<GroupSfuClient | null>;
}

function snapshotStream(stream: MediaStream | null): Record<string, unknown> {
  if (!stream) {
    return { present: false, trackCount: 0, tracks: [] };
  }

  return {
    present: true,
    id: stream.id,
    active: stream.active,
    trackCount: stream.getTracks().length,
    tracks: stream.getTracks().map((track) => snapshotTrack(track)),
  };
}

function useGroupCallDevDebugImpl(options: UseGroupCallDevDebugOptions): void {
  const latestOptionsRef = useRef(options);
  const callMediaDebugEnabledRef = useRef<boolean>(readCallMediaDebugEnabled());
  latestOptionsRef.current = options;

  const buildGroupCallDebugSnapshot = useCallback(async (): Promise<Record<string, unknown> | null> => {
    const current = latestOptionsRef.current;
    const lifecycleState = resolveGroupCallLifecycleState({
      sessionPresent: Boolean(current.session),
      status: current.status,
      accessGranted: current.accessGranted,
      remoteParticipantCount: current.remoteMedia.length,
      isVideoSwitching: current.isVideoSwitching,
      isScreenSwitching: current.isScreenSwitching,
    });
    const lifecycleDefinition = GROUP_CALL_LIFECYCLE_DEFINITIONS[lifecycleState];
    const lifecycle = {
      state: lifecycleState,
      allowedActions: lifecycleDefinition.allowedActions,
      forbiddenActions: lifecycleDefinition.forbiddenActions,
      requiredCleanup: lifecycleDefinition.requiredCleanup,
      canRetryJoin: canGroupCallLifecycleAction(lifecycleState, "retry_join"),
      canToggleScreenShare: canGroupCallLifecycleAction(lifecycleState, "toggle_screen_share"),
    };

    if (!current.session || !current.callId) {
      return {
        callActive: false,
        timestamp: new Date().toISOString(),
        surface: "group-call",
        sessionPresent: Boolean(current.session),
        callId: current.callId,
        status: current.status,
        lifecycle,
      };
    }

    return {
      callActive: true,
      timestamp: new Date().toISOString(),
      surface: "group-call",
      session: {
        groupId: current.session.groupId,
        groupName: current.session.groupName,
        hostUserId: current.session.hostUserId ?? null,
        callType: current.session.callType,
      },
      status: current.status,
      lifecycle,
      callId: current.callId,
      accessGranted: current.accessGranted,
      localIdentity: {
        userId: current.userId,
        deviceId: current.deviceId,
        callHostUserId: current.callHostUserId,
      },
      encryption: {
        requestedMode: current.localRequestedMediaEncryptionMode,
        advertisedMode: current.localAdvertisedMediaEncryptionMode,
        effectiveMode: current.effectiveMediaEncryptionMode,
        localMediaKey: current.localMediaKey,
        sharedMediaKeyDeviceCount: current.sharedMediaKeyDeviceCount,
        receivedMediaKeyCount: current.receivedMediaKeyCount,
        expectedRemoteDeviceIds: [...current.expectedRemoteDeviceIds].sort((left, right) =>
          left.localeCompare(right)
        ),
        remoteParticipantMediaModes: current.remoteParticipantMediaModes,
      },
      participants: {
        activeUserIds: current.activeParticipantUserIds,
        activeDeviceIdsByUserId: current.activeParticipantDeviceIdsByUserId,
      },
      localMedia: {
        localStream: snapshotStream(current.localStreamRef.current),
        localScreenStream: snapshotStream(current.localScreenStreamRef.current),
      },
      remoteMedia: current.remoteMedia.map((participant) => ({
        mediaId: participant.mediaId,
        userId: participant.userId,
        deviceId: participant.deviceId,
        hasAudio: participant.hasAudio,
        hasVideo: participant.hasVideo,
        videoSource: participant.videoSource,
        audioStream: snapshotStream(participant.audioStream),
        videoStream: snapshotStream(participant.videoStream),
      })),
      sfu: current.sfuClientRef.current?.getDebugSnapshot?.() ?? null,
    };
  }, []);

  useEffect(() => {
    const callDebugWindow = globalThis as unknown as CallDebugWindow;
    callDebugWindow.__scGetCallDebugSnapshot = buildGroupCallDebugSnapshot;
    callDebugWindow.__scDumpCallDebug = async () => {
      const snapshot = await buildGroupCallDebugSnapshot();
      if (!snapshot) {
        logger.warn("[CALL][debug] group-call snapshot unavailable");
        return;
      }
      console.groupCollapsed("[CALL][debug] group-call snapshot");
      logger.debug("[CALL][debug] group-call snapshot", snapshot);
      console.groupEnd();
    };
    callDebugWindow.__scSetCallDebugEnabled = (enabled: boolean) => {
      callMediaDebugEnabledRef.current = enabled;
      writeCallMediaDebugEnabled(enabled);
      logger.info(`[CALL][debug] media logging ${enabled ? "enabled" : "disabled"}`);
    };
    callDebugWindow.__scIsCallDebugEnabled = () => callMediaDebugEnabledRef.current;

    return () => {
      delete callDebugWindow.__scGetCallDebugSnapshot;
      delete callDebugWindow.__scDumpCallDebug;
      delete callDebugWindow.__scSetCallDebugEnabled;
      delete callDebugWindow.__scIsCallDebugEnabled;
    };
  }, [buildGroupCallDebugSnapshot]);
}

export const useGroupCallDevDebug = import.meta.env.DEV
  ? useGroupCallDevDebugImpl
  : function useGroupCallDevDebug(): void {};
