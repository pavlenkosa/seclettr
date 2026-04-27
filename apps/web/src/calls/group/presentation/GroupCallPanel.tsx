import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useIsMobileViewport } from "@/lib/hooks";
import { useI18n } from "@/i18n";
import { GroupCallControls } from "@/calls/group/presentation/components/GroupCallControls";
import { GroupCallDetailsDrawer } from "@/calls/group/presentation/components/GroupCallDetailsDrawer";
import { GroupCallDock } from "@/calls/group/presentation/components/GroupCallDock";
import { GroupCallHeader } from "@/calls/group/presentation/components/GroupCallHeader";
import { GroupCallMediaSection } from "@/calls/group/presentation/components/GroupCallMediaSection";
import type { UseGroupCallDevDebugOptions } from "@/calls/group/runtime/useGroupCallDevDebug";
import type { GroupCallRemoteMedia } from "@/calls/group/runtime/sfu";
import { useGroupCallPanelDock } from "@/calls/group/presentation/useGroupCallPanelDock";
import { useGroupCallPanelPresentation } from "@/calls/group/presentation/useGroupCallPanelPresentation";
import {
  useGroupCallPanelUiState,
  useGroupCallPanelUiStateSync,
} from "@/calls/group/presentation/useGroupCallPanelUiState";
import { CallAudioOutputProvider } from "@/calls/shared/media/audio-output/CallAudioOutputProvider";
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
import { PillButton } from "@/components/ui";

import { HangupIcon } from "@/calls/group/presentation/components/GroupCallIcons";
import styles from "./GroupCallPanel.module.css";

const GroupCallDevDebugBridge = import.meta.env.DEV
  ? lazy(() =>
      import("@/calls/group/runtime/GroupCallDevDebugBridge").then(({ GroupCallDevDebugBridge: Component }) => ({
        default: Component,
      }))
    )
  : null;

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

  // ─── Dev-only: mock remote participants for layout testing ──────────────────
  const [mockRemoteMedia, setMockRemoteMedia] = useState<GroupCallRemoteMedia[]>([]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;

    type MockWindow = Window & {
      __scInjectMockParticipants?: (count: number) => void;
      __scClearMockParticipants?: () => void;
    };
    const w = globalThis as unknown as MockWindow;

    w.__scInjectMockParticipants = (count: number) => {
      const participants: GroupCallRemoteMedia[] = [];
      for (let i = 0; i < count; i++) {
        // Alternate: even → audio-only tile, odd → camera tile (no real stream)
        const hasVideo = i % 3 !== 0;
        participants.push({
          mediaId: `mock-${i}:${hasVideo ? "cam" : "audio"}`,
          userId: `mock-user-${i}`,
          deviceId: hasVideo ? `mock-device-${i}` : null,
          hasAudio: true,
          hasVideo,
          audioStream: null,
          videoStream: null,
          videoSource: hasVideo ? "camera" : null,
        });
      }
      setMockRemoteMedia(participants);
    };

    w.__scClearMockParticipants = () => setMockRemoteMedia([]);

    return () => {
      delete w.__scInjectMockParticipants;
      delete w.__scClearMockParticipants;
    };
  }, []);

  // Merge real remote media with mocks — mocks appear after real participants.
  const combinedRemoteMedia = useMemo(
    () => (mockRemoteMedia.length > 0 ? [...runtime.remoteMedia, ...mockRemoteMedia] : runtime.remoteMedia),
    [runtime.remoteMedia, mockRemoteMedia],
  );
  // ────────────────────────────────────────────────────────────────────────────

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

  // Close the details drawer when clicking outside of it.
  useEffect(() => {
    if (!isDetailsOpen) return;

    function handleMouseDown(e: MouseEvent) {
      const target = e.target as Element;
      const drawer = document.getElementById("group-call-details");
      if (drawer?.contains(target)) return;
      if (target.closest("[data-call-details-toggle]")) return;
      setIsDetailsOpen(false);
    }

    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [isDetailsOpen, setIsDetailsOpen]);

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

  const devDebugOptions: UseGroupCallDevDebugOptions = {
    session,
    status: runtime.status,
    callId: runtime.callId,
    accessGranted: runtime.accessGranted,
    isVideoSwitching: runtime.isVideoSwitching,
    isScreenSwitching: runtime.isScreenSwitching,
    callHostUserId: runtime.callHostUserId,
    userId: runtime.userId,
    deviceId: runtime.deviceId,
    localStreamRef: runtime.localStreamRef,
    localScreenStreamRef: runtime.localScreenStreamRef,
    remoteMedia: combinedRemoteMedia,
    activeParticipantUserIds: runtime.activeParticipantUserIds,
    activeParticipantDeviceIdsByUserId: runtime.activeParticipantDeviceIdsByUserId,
    remoteParticipantMediaModes: runtime.remoteParticipantMediaModes,
    localRequestedMediaEncryptionMode: runtime.localRequestedMediaEncryptionMode,
    localAdvertisedMediaEncryptionMode: runtime.localAdvertisedMediaEncryptionMode,
    effectiveMediaEncryptionMode: runtime.effectiveMediaEncryptionMode,
    localMediaKey: runtime.localMediaKey,
    sharedMediaKeyDeviceCount: runtime.sharedMediaKeyDeviceCount,
    receivedMediaKeyCount: runtime.receivedMediaKeyCount,
    expectedRemoteDeviceIds: runtime.expectedRemoteDeviceIds,
    sfuClientRef: runtime.sfuClientRef,
  };
  const devDebugBridge = GroupCallDevDebugBridge ? (
    <Suspense fallback={null}>
      <GroupCallDevDebugBridge {...devDebugOptions} />
    </Suspense>
  ) : null;

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
    const dockContent = (
      <GroupCallDock
        groupName={session.groupName}
        groupInitials={presentation.groupInitials}
        isDragging={isDraggingMinimizedDock}
        dockRef={minimizedDockRef}
        inlineStyle={resolvedDockInlineStyle}
        dockMetaLabel={dockMetaLabel}
        leaveActionLabel={presentation.leaveActionLabel}
        onRestore={handleRestore}
        onLeave={runtime.handleLeave}
        onDragStart={startMinimizedDockDrag}
        onDragMove={moveMinimizedDock}
        onDragEnd={stopMinimizedDockDrag}
      />
    );
    return (
      <>
        {devDebugBridge}
        {createPortal(dockContent, document.body)}
      </>
    );
  }

  const panelDialog = (
    <dialog open className={styles.backdrop} aria-modal="true" aria-label={t("group.call.dialogAria")}>
      <div className={styles.panel}>
        <GroupCallHeader
          groupName={session.groupName}
          memberCount={session.members.length}
          title={presentation.title}
          callDurationSeconds={runtime.callDurationSeconds}
          callDurationStartedAtMs={runtime.callDurationStartedAtMs}
          hasVisibleVideo={presentation.hasVisibleVideo}
          hasRemoteScreenShare={presentation.hasRemoteScreenShare}
          heroStatusLabel={presentation.heroStatusLabel}
          heroStatusTone={presentation.heroStatusTone}
          detailsLabel={detailsLabel}
          detailsToggleLabel={presentation.detailsToggleLabel}
          isDetailsOpen={isDetailsOpen}
          onToggleDetails={handleToggleDetails}
          onMinimize={handleMinimize}
        />

        <div className={presentation.bodyClassName}>
          <div className={styles.mainColumn}>
            <GroupCallMediaSection
              stageShellRef={stageShellRef}
              shouldUseStageLayout={presentation.shouldUseStageLayout}
              stageTile={presentation.stageTile}
              stripTiles={presentation.stripTiles}
              galleryTiles={presentation.galleryTiles}
              hasPinnedStageSelection={presentation.hasPinnedStageSelection}
              canToggleStageFullscreen={canToggleStagePresentation}
              isStageViewerOpen={isStageViewerOpen}
              isCompactStagePreview={isCompactStagePreview}
              isWaitingSoloAudioLayout={presentation.isWaitingSoloAudioLayout}
              isCrowdedGalleryLayout={presentation.isCrowdedGalleryLayout}
              localVideoStatusLabel={presentation.localVideoStatusLabel}
              stageEyebrowLabel={presentation.stageEyebrowLabel}
              focusHintLabel={presentation.focusHintLabel}
              fullscreenToggleLabel={stageExpandLabel}
              resetStageFocusLabel={presentation.resetStageFocusLabel}
              mediaGridClassName={presentation.mediaGridClassName}
              mediaEmptyClassName={presentation.mediaEmptyClassName}
              hasRemoteScreenShare={presentation.hasRemoteScreenShare}
              remoteMediaCount={runtime.remoteMedia.length}
              onResetStageFocus={handleResetStageFocus}
              onStopWatchingStageTile={handleStopWatchingStageTile}
              onToggleStageFullscreen={handleToggleStagePresentation}
              onSelectTile={handleSelectTile}
            />
          </div>
        </div>

        <GroupCallDetailsDrawer
          isOpen={isDetailsOpen}
          roomCode={presentation.roomCode}
          statusLabel={presentation.statusLabel}
          mediaKeyStatusLabel={presentation.mediaKeyStatusLabel}
          mediaKeyModeLabel={presentation.mediaKeyModeLabel}
          mediaModeDowngraded={presentation.mediaModeDowngraded}
          effectiveFrameEncryptionEnabled={runtime.effectiveFrameEncryptionEnabled}
          sharedMediaKeyDeviceCount={runtime.sharedMediaKeyDeviceCount}
          receivedMediaKeyCount={runtime.receivedMediaKeyCount}
          members={presentation.sortedMembers}
          activeParticipantSet={presentation.activeParticipantSet}
          error={runtime.error}
        />

        <div className={styles.bottomDock}>
          <GroupCallControls
            className={presentation.controlRailClassName}
            layout={isMobileViewport ? "stacked" : "inline"}
            hasLocalMedia={Boolean(runtime.localStream)}
            status={runtime.status}
            isAudioMuted={runtime.isLocalAudioMuted}
            isLocalVideoEnabled={presentation.isLocalVideoEnabled}
            isLocalScreenSharing={runtime.isLocalScreenSharing}
            isVideoSwitching={runtime.isVideoSwitching}
            isScreenSwitching={runtime.isScreenSwitching}
            muteToggleLabel={presentation.muteToggleLabel}
            videoToggleLabel={presentation.videoToggleLabel}
            screenShareToggleLabel={presentation.screenShareToggleLabel}
            onToggleMute={runtime.handleToggleMute}
            onToggleVideo={runtime.handleToggleVideo}
            onToggleScreenShare={runtime.handleToggleScreenShare}
          />

          <div
            className={[
              styles.bottomDockActions,
              presentation.actionsClassName,
              presentation.canEndForEveryone ? styles.actionsDual : styles.actionsSingle,
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <PillButton
              type="button"
              onClick={() => runtime.handleLeave()}
              className={`${styles.dangerActionBtn} ${styles.dangerActionBtnSecondary}`}
              tone="danger"
              appearance="soft"
              size="md"
              leading={<HangupIcon />}
            >
              {presentation.leaveActionLabel}
            </PillButton>

            {presentation.canEndForEveryone ? (
              <PillButton
                type="button"
                onClick={() => runtime.handleEndForEveryone()}
                className={`${styles.dangerActionBtn} ${styles.dangerActionBtnPrimary}`}
                tone="danger"
                appearance="strong"
                size="md"
                leading={<HangupIcon />}
              >
                {presentation.endForEveryoneLabel}
              </PillButton>
            ) : null}
          </div>
        </div>

      </div>
    </dialog>
  );

  const panelContent = (
    <CallAudioOutputProvider>
      {panelDialog}
    </CallAudioOutputProvider>
  );

  return (
    <>
      {devDebugBridge}
      {createPortal(panelContent, document.body)}
    </>
  );
}
