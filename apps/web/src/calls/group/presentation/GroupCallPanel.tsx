import { useCallback, useRef } from "react";
import { useIsMobileViewport } from "@/lib/hooks";
import { useI18n } from "@/i18n";
import type { GroupCallRemoteMedia } from "@/calls/group/runtime/sfu";
import { useGroupCallPanelDock } from "@/calls/group/presentation/useGroupCallPanelDock";
import { useGroupCallPanelPresentation } from "@/calls/group/presentation/useGroupCallPanelPresentation";
import {
  useGroupCallPanelUiState,
  useGroupCallPanelUiStateSync,
} from "@/calls/group/presentation/useGroupCallPanelUiState";
import { useCallInputDevices } from "@/calls/shared/media/input-devices/useCallInputDevices";
import {
  useGroupCallPanelRuntime,
  type UseGroupCallPanelRuntimeResult,
} from "@/calls/group/runtime/useGroupCallPanelRuntime";
import { useGroupCallStageFullscreen } from "@/calls/group/presentation/useGroupCallStageFullscreen";
import { isGroupCallConnectedLifecycleState } from "@/calls/group/model/group-call-lifecycle";
import { CallDurationText } from "@/calls/shared/presentation/CallDurationText";
import { resolveGroupCallDockInlineStyle } from "@/calls/group/presentation/display";
import { resolveGroupCallPanelSurface } from "@/calls/group/presentation/group-call-panel-surface";
import type { GroupCallPanelSession } from "@/calls/group/model/entry";
import { GroupCallPanelDockBranch } from "@/calls/group/presentation/GroupCallPanelDockBranch";
import { GroupCallPanelDevDebug } from "@/calls/group/presentation/GroupCallPanelDevDebug";
import { GroupCallPanelShellView } from "@/calls/group/presentation/GroupCallPanelShellView";
import { buildGroupCallPanelViewProps } from "@/calls/group/presentation/buildGroupCallPanelViewProps";
import { useGroupCallDetailsDismiss } from "@/calls/group/presentation/useGroupCallDetailsDismiss";
import { useGroupCallPanelDevMocks } from "@/calls/group/presentation/useGroupCallPanelDevMocks";

import styles from "./GroupCallPanel.module.css";

interface Props {
  readonly session: GroupCallPanelSession | null;
  readonly onClose: () => void;
}

export function GroupCallPanel({ session, onClose }: Props) {
  const { t } = useI18n();
  const isMobileViewport = useIsMobileViewport();

  const stageShellRef = useRef<HTMLDivElement | null>(null);
  const {
    isMinimized,
    setIsMinimized,
    isDetailsOpen,
    setIsDetailsOpen,
    isStageViewerOpen,
    setIsStageViewerOpen,
    pinnedStageTileId,
    setPinnedStageTileId,
    suppressedStageTileIds,
    setSuppressedStageTileIds,
    handleToggleDetails,
    handleMinimize,
    handleRestore,
    handleResetStageFocus,
    handleStopWatchingStageTile,
    handleSelectTile,
  } = useGroupCallPanelUiState({
    sessionGroupId: session?.groupId ?? null,
  });

  const {
    isDraggingMinimizedDock,
    minimizedDockRef,
    dockInlineStyle,
    resetMinimizedDock,
    startMinimizedDockDrag,
    moveMinimizedDock,
    stopMinimizedDockDrag,
  } = useGroupCallPanelDock({ isMinimized });

  const runtime: UseGroupCallPanelRuntimeResult = useGroupCallPanelRuntime({
    session,
    onClose,
    resetMinimizedDock,
    setIsMinimized,
    setPinnedStageTileId,
  });

  const {
    micDevices,
    cameraDevices,
    selectedMicId,
    selectedCameraId,
  } = useCallInputDevices(runtime.localStream);

  const combinedRemoteMedia = useGroupCallPanelDevMocks(runtime.remoteMedia);

  const surface = resolveGroupCallPanelSurface(isMinimized);
  const { isStageFullscreen, handleToggleStageFullscreen } = useGroupCallStageFullscreen({
    stageShellRef,
  });
  const presentation = useGroupCallPanelPresentation({
    session,
    status: runtime.status,
    error: runtime.error,
    accessGranted: runtime.accessGranted,
    callId: runtime.callId,
    callHostUserId: runtime.callHostUserId,
    userId: runtime.userId,
    username: runtime.username,
    activeParticipantUserIds: runtime.activeParticipantUserIds,
    remoteMedia: combinedRemoteMedia,
    localRequestedMediaEncryptionMode: runtime.localRequestedMediaEncryptionMode,
    effectiveMediaEncryptionMode: runtime.effectiveMediaEncryptionMode,
    effectiveFrameEncryptionEnabled: runtime.effectiveFrameEncryptionEnabled,
    localMediaKey: runtime.localMediaKey,
    sharedMediaKeyDeviceCount: runtime.sharedMediaKeyDeviceCount,
    receivedMediaKeyCount: runtime.receivedMediaKeyCount,
    isDetailsOpen,
    isSidePanelOpen: false,
    isStageFullscreen,
    pinnedStageTileId,
    suppressedStageTileIds,
    localStream: runtime.localStream,
    localScreenStream: runtime.localScreenStream,
    isLocalAudioMuted: runtime.isLocalAudioMuted,
    isLocalScreenSharing: runtime.isLocalScreenSharing,
    isVideoSwitching: runtime.isVideoSwitching,
    isScreenSwitching: runtime.isScreenSwitching,
  });

  const isCompactStagePreview = Boolean(
    isMobileViewport
    && presentation.stageTile?.hasVideo
    && presentation.stageTile.videoSource === "screen"
  );
  useGroupCallPanelUiStateSync({
    runtimeError: runtime.error,
    callTiles: presentation.callTiles,
    isCompactStagePreview,
    setSuppressedStageTileIds,
    setIsDetailsOpen,
    setIsStageViewerOpen,
  });

  useGroupCallDetailsDismiss(isDetailsOpen, setIsDetailsOpen);

  const handleToggleStagePresentation = useCallback(() => {
    if (isCompactStagePreview) {
      setIsStageViewerOpen((current) => !current);
      return;
    }

    return handleToggleStageFullscreen();
  }, [handleToggleStageFullscreen, isCompactStagePreview, setIsStageViewerOpen]);

  const compactStageLabel = isStageViewerOpen
    ? t("group.call.stage.exitFullscreen")
    : t("group.call.stage.enterFullscreen");
  const stageExpandLabel = isCompactStagePreview ? compactStageLabel : presentation.fullscreenToggleLabel;
  const canToggleStagePresentation = isCompactStagePreview || presentation.canToggleStageFullscreen;
  const shouldRenderInlineDetails = false;
  const bodyClassName = presentation.bodyClassName;

  const devDebugBridge = (
    <GroupCallPanelDevDebug
      session={session}
      runtime={runtime}
      remoteMedia={combinedRemoteMedia}
    />
  );

  if (!session) return devDebugBridge;

  const resolvedDockInlineStyle = resolveGroupCallDockInlineStyle(dockInlineStyle);
  const detailsLabel = t("group.call.detailsTab");
  const dockMetaLabel = isGroupCallConnectedLifecycleState(presentation.lifecycleState)
    ? (
        <>
          {presentation.title}
          {" / "}
          <CallDurationText
            baseSeconds={runtime.callDurationSeconds}
            startedAtMs={runtime.callDurationStartedAtMs}
          />
        </>
      )
    : presentation.statusLabel;

  if (surface === "dock") {
    return (
      <>
        {devDebugBridge}
        <GroupCallPanelDockBranch
          remoteMedia={combinedRemoteMedia}
          dockProps={{
            groupName: session.groupName,
            groupInitials: presentation.groupInitials,
            isDragging: isDraggingMinimizedDock,
            dockRef: minimizedDockRef,
            inlineStyle: resolvedDockInlineStyle,
            dockMetaLabel,
            leaveActionLabel: presentation.leaveActionLabel,
            onRestore: handleRestore,
            onLeave: runtime.handleLeave,
            onDragStart: startMinimizedDockDrag,
            onDragMove: moveMinimizedDock,
            onDragEnd: stopMinimizedDockDrag,
          }}
        />
      </>
    );
  }

  const {
    dockProps,
    headerProps,
    mediaSectionProps,
    detailsDrawerProps,
    controlsProps,
  } = buildGroupCallPanelViewProps({
    session,
    stageShellRef,
    isDraggingMinimizedDock,
    minimizedDockRef,
    resolvedDockInlineStyle,
    dockMetaLabel,
    detailsLabel,
    isDetailsOpen,
    isStageViewerOpen,
    isCompactStagePreview,
    canToggleStagePresentation,
    shouldRenderInlineDetails,
    stageExpandLabel,
    closeViewerLabel: t("group.call.stage.closeViewer"),
    exitFullscreenLabel: t("group.call.stage.exitFullscreen"),
    endForEveryoneHint: t("group.call.endForEveryoneHint"),
    presentation,
    runtime: {
      callDurationSeconds: runtime.callDurationSeconds,
      callDurationStartedAtMs: runtime.callDurationStartedAtMs,
      remoteMediaCount: runtime.remoteMedia.length,
      effectiveFrameEncryptionEnabled: runtime.effectiveFrameEncryptionEnabled,
      sharedMediaKeyDeviceCount: runtime.sharedMediaKeyDeviceCount,
      receivedMediaKeyCount: runtime.receivedMediaKeyCount,
      error: runtime.error,
      localStream: runtime.localStream,
      status: runtime.status,
      isLocalAudioMuted: runtime.isLocalAudioMuted,
      isLocalScreenSharing: runtime.isLocalScreenSharing,
      isVideoSwitching: runtime.isVideoSwitching,
      isScreenSwitching: runtime.isScreenSwitching,
      selectedVideoResolution: runtime.selectedVideoResolution,
      selectedScreenResolution: runtime.selectedScreenResolution,
      handleLeave: runtime.handleLeave,
      handleEndForEveryone: runtime.handleEndForEveryone,
      handleToggleMute: runtime.handleToggleMute,
      handleToggleVideo: runtime.handleToggleVideo,
      handleToggleScreenShare: runtime.handleToggleScreenShare,
      handleSwitchMic: runtime.handleSwitchMic,
      handleSwitchCamera: runtime.handleSwitchCamera,
      handleSelectVideoResolution: runtime.handleSelectVideoResolution,
      handleSelectScreenResolution: runtime.handleSelectScreenResolution,
    },
    devices: {
      micDevices,
      cameraDevices,
      selectedMicId,
      selectedCameraId,
    },
    handlers: {
      handleRestore,
      startMinimizedDockDrag,
      moveMinimizedDock,
      stopMinimizedDockDrag,
      handleToggleDetails,
      handleMinimize,
      handleResetStageFocus,
      handleStopWatchingStageTile,
      handleToggleStagePresentation,
      handleSelectTile,
    },
  });

  return (
    <>
      {devDebugBridge}
      <GroupCallPanelShellView
        remoteMedia={combinedRemoteMedia}
        ariaLabel={t("group.call.dialogAria")}
        backdropClassName={styles.backdrop}
        panelClassName={styles.panel}
        bodyClassName={bodyClassName}
        mainColumnClassName={styles.mainColumn}
        bottomDockClassName={styles.bottomDock}
        headerProps={headerProps}
        mediaSectionProps={mediaSectionProps}
        detailsDrawerProps={detailsDrawerProps}
        controlsProps={controlsProps}
      />
    </>
  );
}
