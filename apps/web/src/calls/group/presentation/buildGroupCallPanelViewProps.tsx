import type { CSSProperties, ComponentProps, ReactNode, RefObject } from "react";
import type { GroupCallPanelSession } from "@/calls/group/model/entry";
import { GroupCallControls } from "@/calls/group/presentation/components/GroupCallControls";
import { GroupCallDetailsDrawer } from "@/calls/group/presentation/components/GroupCallDetailsDrawer";
import { GroupCallDock } from "@/calls/group/presentation/components/GroupCallDock";
import { GroupCallHeader } from "@/calls/group/presentation/components/GroupCallHeader";
import { GroupCallMediaSection } from "@/calls/group/presentation/components/GroupCallMediaSection";

interface BuildGroupCallPanelViewPropsParams {
  readonly session: GroupCallPanelSession;
  readonly stageShellRef: RefObject<HTMLDivElement>;
  readonly isDraggingMinimizedDock: boolean;
  readonly minimizedDockRef: RefObject<HTMLDialogElement>;
  readonly resolvedDockInlineStyle: CSSProperties | undefined;
  readonly dockMetaLabel: ReactNode;
  readonly detailsLabel: string;
  readonly isDetailsOpen: boolean;
  readonly isStageViewerOpen: boolean;
  readonly isCompactStagePreview: boolean;
  readonly canToggleStagePresentation: boolean;
  readonly shouldRenderInlineDetails: boolean;
  readonly stageExpandLabel: string;
  readonly closeViewerLabel: string;
  readonly exitFullscreenLabel: string;
  readonly endForEveryoneHint: string;
  readonly presentation: {
    readonly groupInitials: string;
    readonly leaveActionLabel: string;
    readonly title: string;
    readonly hasVisibleVideo: boolean;
    readonly hasRemoteScreenShare: boolean;
    readonly heroStatusLabel: string;
    readonly heroStatusTone: ComponentProps<typeof GroupCallHeader>["heroStatusTone"];
    readonly detailsToggleLabel: string;
    readonly shouldUseStageLayout: boolean;
    readonly stageTile: ComponentProps<typeof GroupCallMediaSection>["stageTile"];
    readonly stripTiles: ComponentProps<typeof GroupCallMediaSection>["stripTiles"];
    readonly galleryTiles: ComponentProps<typeof GroupCallMediaSection>["galleryTiles"];
    readonly hasPinnedStageSelection: boolean;
    readonly isWaitingSoloAudioLayout: boolean;
    readonly isCrowdedGalleryLayout: boolean;
    readonly localVideoStatusLabel: string;
    readonly stageEyebrowLabel: string;
    readonly focusHintLabel: string;
    readonly resetStageFocusLabel: string;
    readonly mediaGridClassName: string | undefined;
    readonly mediaEmptyClassName: string | undefined;
    readonly roomCode: string;
    readonly statusLabel: string;
    readonly mediaKeyStatusLabel: string;
    readonly mediaKeyModeLabel: string;
    readonly mediaModeDowngraded: boolean;
    readonly sortedMembers: ComponentProps<typeof GroupCallDetailsDrawer>["members"];
    readonly activeParticipantSet: ComponentProps<typeof GroupCallDetailsDrawer>["activeParticipantSet"];
    readonly canEndForEveryone: boolean;
    readonly endForEveryoneLabel: string;
    readonly controlRailClassName: string | undefined;
    readonly isLocalVideoEnabled: boolean;
    readonly muteToggleLabel: string;
    readonly videoToggleLabel: string;
    readonly screenShareToggleLabel: string;
  };
  readonly runtime: {
    readonly callDurationSeconds: number;
    readonly callDurationStartedAtMs: number | null;
    readonly remoteMediaCount: number;
    readonly effectiveFrameEncryptionEnabled: boolean;
    readonly sharedMediaKeyDeviceCount: number;
    readonly receivedMediaKeyCount: number;
    readonly error: string | null;
    readonly localStream: MediaStream | null;
    readonly status: ComponentProps<typeof GroupCallControls>["status"];
    readonly isLocalAudioMuted: boolean;
    readonly isLocalScreenSharing: boolean;
    readonly isVideoSwitching: boolean;
    readonly isScreenSwitching: boolean;
    readonly selectedVideoResolution: ComponentProps<typeof GroupCallControls>["selectedVideoResolution"];
    readonly selectedScreenResolution: ComponentProps<typeof GroupCallControls>["selectedScreenResolution"];
    readonly handleLeave: () => void;
    readonly handleEndForEveryone: () => void;
    readonly handleToggleMute: () => void;
    readonly handleToggleVideo: () => void | Promise<void>;
    readonly handleToggleScreenShare: () => void | Promise<void>;
    readonly handleSwitchMic?: ComponentProps<typeof GroupCallControls>["onSelectMic"];
    readonly handleSwitchCamera?: ComponentProps<typeof GroupCallControls>["onSelectCamera"];
    readonly handleSelectVideoResolution?: ComponentProps<typeof GroupCallControls>["onSelectVideoResolution"];
    readonly handleSelectScreenResolution?: ComponentProps<typeof GroupCallControls>["onSelectScreenResolution"];
  };
  readonly devices: {
    readonly micDevices: ComponentProps<typeof GroupCallControls>["micDevices"];
    readonly cameraDevices: ComponentProps<typeof GroupCallControls>["cameraDevices"];
    readonly selectedMicId: ComponentProps<typeof GroupCallControls>["selectedMicId"];
    readonly selectedCameraId: ComponentProps<typeof GroupCallControls>["selectedCameraId"];
  };
  readonly handlers: {
    readonly handleRestore: () => void;
    readonly startMinimizedDockDrag: ComponentProps<typeof GroupCallDock>["onDragStart"];
    readonly moveMinimizedDock: ComponentProps<typeof GroupCallDock>["onDragMove"];
    readonly stopMinimizedDockDrag: ComponentProps<typeof GroupCallDock>["onDragEnd"];
    readonly handleToggleDetails: () => void;
    readonly handleMinimize: () => void;
    readonly handleResetStageFocus: () => void;
    readonly handleStopWatchingStageTile: (tileId: string) => void;
    readonly handleToggleStagePresentation: () => void | Promise<void>;
    readonly handleSelectTile: (tileId: string) => void;
  };
}

export function buildGroupCallPanelViewProps({
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
  closeViewerLabel,
  exitFullscreenLabel,
  endForEveryoneHint,
  presentation,
  runtime,
  devices,
  handlers,
}: BuildGroupCallPanelViewPropsParams) {
  return {
    dockProps: {
      groupName: session.groupName,
      groupInitials: presentation.groupInitials,
      isDragging: isDraggingMinimizedDock,
      dockRef: minimizedDockRef,
      inlineStyle: resolvedDockInlineStyle,
      dockMetaLabel,
      leaveActionLabel: presentation.leaveActionLabel,
      onRestore: handlers.handleRestore,
      onLeave: runtime.handleLeave,
      onDragStart: handlers.startMinimizedDockDrag,
      onDragMove: handlers.moveMinimizedDock,
      onDragEnd: handlers.stopMinimizedDockDrag,
    } satisfies ComponentProps<typeof GroupCallDock>,
    headerProps: {
      groupName: session.groupName,
      memberCount: session.members.length,
      title: presentation.title,
      callDurationSeconds: runtime.callDurationSeconds,
      callDurationStartedAtMs: runtime.callDurationStartedAtMs,
      hasVisibleVideo: presentation.hasVisibleVideo,
      hasRemoteScreenShare: presentation.hasRemoteScreenShare,
      heroStatusLabel: presentation.heroStatusLabel,
      heroStatusTone: presentation.heroStatusTone,
      detailsLabel,
      detailsToggleLabel: presentation.detailsToggleLabel,
      isDetailsOpen,
      onToggleDetails: handlers.handleToggleDetails,
      onMinimize: handlers.handleMinimize,
    } satisfies ComponentProps<typeof GroupCallHeader>,
    mediaSectionProps: {
      stageShellRef,
      shouldUseStageLayout: presentation.shouldUseStageLayout,
      stageTile: presentation.stageTile,
      stripTiles: presentation.stripTiles,
      galleryTiles: presentation.galleryTiles,
      hasPinnedStageSelection: presentation.hasPinnedStageSelection,
      canToggleStageFullscreen: canToggleStagePresentation,
      isStageViewerOpen,
      isCompactStagePreview,
      isWaitingSoloAudioLayout: presentation.isWaitingSoloAudioLayout,
      isCrowdedGalleryLayout: presentation.isCrowdedGalleryLayout,
      localVideoStatusLabel: presentation.localVideoStatusLabel,
      stageEyebrowLabel: presentation.stageEyebrowLabel,
      focusHintLabel: presentation.focusHintLabel,
      enterFullscreenLabel: stageExpandLabel,
      exitFullscreenLabel,
      closeViewerLabel,
      resetStageFocusLabel: presentation.resetStageFocusLabel,
      mediaGridClassName: presentation.mediaGridClassName ?? "",
      mediaEmptyClassName: presentation.mediaEmptyClassName ?? "",
      hasRemoteScreenShare: presentation.hasRemoteScreenShare,
      remoteMediaCount: runtime.remoteMediaCount,
      onResetStageFocus: handlers.handleResetStageFocus,
      onStopWatchingStageTile: handlers.handleStopWatchingStageTile,
      onToggleStageFullscreen: handlers.handleToggleStagePresentation,
      onSelectTile: handlers.handleSelectTile,
    } satisfies ComponentProps<typeof GroupCallMediaSection>,
    detailsDrawerProps: {
      isOpen: isDetailsOpen,
      inline: shouldRenderInlineDetails,
      roomCode: presentation.roomCode,
      statusLabel: presentation.statusLabel,
      mediaKeyStatusLabel: presentation.mediaKeyStatusLabel,
      mediaKeyModeLabel: presentation.mediaKeyModeLabel,
      mediaModeDowngraded: presentation.mediaModeDowngraded,
      effectiveFrameEncryptionEnabled: runtime.effectiveFrameEncryptionEnabled,
      sharedMediaKeyDeviceCount: runtime.sharedMediaKeyDeviceCount,
      receivedMediaKeyCount: runtime.receivedMediaKeyCount,
      members: presentation.sortedMembers,
      activeParticipantSet: presentation.activeParticipantSet,
      error: runtime.error,
      hostActionLabel: presentation.canEndForEveryone ? presentation.endForEveryoneLabel : undefined,
      hostActionHint: presentation.canEndForEveryone ? endForEveryoneHint : undefined,
      onHostAction: presentation.canEndForEveryone ? runtime.handleEndForEveryone : undefined,
    } satisfies ComponentProps<typeof GroupCallDetailsDrawer>,
    controlsProps: {
      className: presentation.controlRailClassName,
      layout: "inline" as const,
      hasLocalMedia: Boolean(runtime.localStream),
      status: runtime.status,
      isAudioMuted: runtime.isLocalAudioMuted,
      isLocalVideoEnabled: presentation.isLocalVideoEnabled,
      isLocalScreenSharing: runtime.isLocalScreenSharing,
      isVideoSwitching: runtime.isVideoSwitching,
      isScreenSwitching: runtime.isScreenSwitching,
      muteToggleLabel: presentation.muteToggleLabel,
      videoToggleLabel: presentation.videoToggleLabel,
      screenShareToggleLabel: presentation.screenShareToggleLabel,
      leaveActionLabel: presentation.leaveActionLabel,
      micDevices: devices.micDevices,
      cameraDevices: devices.cameraDevices,
      selectedMicId: devices.selectedMicId,
      selectedCameraId: devices.selectedCameraId,
      selectedVideoResolution: runtime.selectedVideoResolution,
      onToggleMute: runtime.handleToggleMute,
      onToggleVideo: runtime.handleToggleVideo,
      onToggleScreenShare: runtime.handleToggleScreenShare,
      onLeave: runtime.handleLeave,
      onSelectMic: runtime.handleSwitchMic,
      onSelectCamera: runtime.handleSwitchCamera,
      onSelectVideoResolution: runtime.handleSelectVideoResolution,
      selectedScreenResolution: runtime.selectedScreenResolution,
      onSelectScreenResolution: runtime.handleSelectScreenResolution,
    } satisfies ComponentProps<typeof GroupCallControls>,
  };
}
