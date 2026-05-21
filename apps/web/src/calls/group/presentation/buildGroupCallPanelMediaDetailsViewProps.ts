/**
 * buildGroupCallPanelMediaDetailsViewProps — view-props builder for the media section and details drawer.
 *
 * Owns:
 *   - GroupCallPanelMediaDetailsViewProps type (mediaSectionProps + detailsDrawerProps)
 *   - buildGroupCallPanelMediaDetailsViewProps — maps GroupCallPanelViewPropsBuildParams to
 *     the props consumed by GroupCallMediaSection and GroupCallDetailsDrawer
 *
 * Does not own any state or rendering — this is a pure props-mapping function.
 */
import type { ComponentProps } from "react";
import { GroupCallDetailsDrawer } from "@/calls/group/presentation/components/GroupCallDetailsDrawer";
import { GroupCallMediaSection } from "@/calls/group/presentation/components/GroupCallMediaSection";
import type { GroupCallPanelViewPropsBuildParams } from "@/calls/group/presentation/group-call-panel-view-props-contract";

interface GroupCallPanelMediaDetailsViewProps {
  readonly mediaSectionProps: ComponentProps<typeof GroupCallMediaSection>;
  readonly detailsDrawerProps: ComponentProps<typeof GroupCallDetailsDrawer>;
}

export function buildGroupCallPanelMediaDetailsViewProps({
  stageShellRef,
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
  handlers,
}: GroupCallPanelViewPropsBuildParams): GroupCallPanelMediaDetailsViewProps {
  return {
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
    },
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
    },
  };
}
