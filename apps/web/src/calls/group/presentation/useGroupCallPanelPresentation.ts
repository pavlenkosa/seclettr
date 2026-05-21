/**
 * useGroupCallPanelPresentation — derived presentation state for the group call panel.
 *
 * Owns:
 *   - Full UseGroupCallPanelPresentationResult: all labels, tiles, layout flags, and
 *     class names consumed by GroupCallPanel and its sub-components
 *   - Tile construction: createLocalCallTiles + createRemoteCallTile → callTiles array
 *   - Stage tile selection (resolveGroupCallStageTileId with pinned override)
 *   - Gallery vs. stage layout decision (shouldShowStageLayout, isCrowdedGallery, etc.)
 *   - Label resolution: status, hero status, media key mode/status, leave/end labels
 *   - CSS class name resolution (resolvePanelClassNames) for body/grid/rail elements
 *
 * Does not own action dispatch, session lifecycle, or remote media subscription.
 * All inputs are passed in as props/state; this hook is purely derived/display logic.
 */
import { useMemo } from "react";
import { useI18n } from "@/i18n";
import type { LocalGroupCallMediaKey } from "@/calls/group/runtime/media-key/media-key";
import type { GroupCallRemoteMedia } from "@/calls/group/runtime/sfu";
import { type StatusBadgeTone } from "@/components/ui";

import {
  isGroupMediaModeDowngraded,
  type GroupCallRuntimeMediaEncryptionMode,
} from "@/calls/group/runtime/media-key/media-encryption-negotiation";
import { resolveGroupCallStageTileId } from "@/calls/group/model/group-call-stage";
import type {
  GroupCallPanelSession,
  GroupCallStageTile,
  GroupCallStatus,
} from "@/calls/group/model/group-call-types";
import {
  resolveGroupCallLifecycleState,
  type GroupCallLifecycleState,
} from "@/calls/group/model/group-call-lifecycle";
import { getMemberInitials } from "@/calls/group/presentation/display";
import { formatGroupCallRoomCode } from "@/calls/group/presentation/group-call-panel-surface";
import {
  resolveStatusLabel,
  resolveHeroStatusLabel,
  resolveHeroStatusTone,
  resolveLocalVideoStatusLabel,
  resolveMediaKeyModeLabel,
  resolveMediaKeyStatusLabel,
} from "./group-call-panel-labels";
import {
  buildMemberNameMap,
  createLocalCallTiles,
  createRemoteCallTile,
  hasPinnedStageTile,
  isAudioOnlyGallery,
  isCompactGallery,
  isCrowdedGallery,
  isWaitingSoloAudioGallery,
  resolvePanelClassNames,
  shouldForceCrowdedStageLayout,
  shouldShowStageLayout,
} from "./group-call-panel-tiles";

interface UseGroupCallPanelPresentationOptions {
  session: GroupCallPanelSession | null;
  status: GroupCallStatus;
  error: string | null;
  accessGranted: boolean;
  callId: string | null;
  callHostUserId: string | null;
  userId: string | null;
  username: string | null;
  activeParticipantUserIds: string[];
  remoteMedia: GroupCallRemoteMedia[];
  localRequestedMediaEncryptionMode: GroupCallRuntimeMediaEncryptionMode;
  effectiveMediaEncryptionMode: GroupCallRuntimeMediaEncryptionMode;
  effectiveFrameEncryptionEnabled: boolean;
  localMediaKey: LocalGroupCallMediaKey | null;
  sharedMediaKeyDeviceCount: number;
  receivedMediaKeyCount: number;
  isDetailsOpen: boolean;
  isSidePanelOpen: boolean;
  isStageFullscreen: boolean;
  pinnedStageTileId: string | null;
  suppressedStageTileIds: ReadonlySet<string>;
  localStream: MediaStream | null;
  localScreenStream: MediaStream | null;
  isLocalAudioMuted: boolean;
  isLocalScreenSharing: boolean;
  isVideoSwitching: boolean;
  isScreenSwitching: boolean;
}

interface UseGroupCallPanelPresentationResult {
  lifecycleState: GroupCallLifecycleState;
  isReconnecting: boolean;
  roomCode: string;
  title: string;
  statusLabel: string;
  heroStatusLabel: string;
  heroStatusTone: StatusBadgeTone;
  isLocalVideoEnabled: boolean;
  hasVisibleVideo: boolean;
  sortedMembers: GroupCallPanelSession["members"];
  activeParticipantSet: Set<string>;
  localVideoStatusLabel: string;
  mediaKeyModeLabel: string;
  mediaModeDowngraded: boolean;
  mediaKeyStatusLabel: string;
  canEndForEveryone: boolean;
  leaveActionLabel: string;
  endForEveryoneLabel: string;
  detailsToggleLabel: string;
  muteToggleLabel: string;
  videoToggleLabel: string;
  screenShareToggleLabel: string;
  callTiles: GroupCallStageTile[];
  stageTile: GroupCallStageTile | null;
  stripTiles: GroupCallStageTile[];
  galleryTiles: GroupCallStageTile[];
  hasPinnedStageSelection: boolean;
  hasRemoteScreenShare: boolean;
  shouldUseStageLayout: boolean;
  isWaitingSoloAudioLayout: boolean;
  isCrowdedGalleryLayout: boolean;
  stageEyebrowLabel: string;
  focusHintLabel: string;
  fullscreenToggleLabel: string;
  resetStageFocusLabel: string;
  canToggleStageFullscreen: boolean;
  groupInitials: string;
  shouldUseCompactBodyLayout: boolean;
  bodyClassName: string;
  mediaGridClassName: string;
  mediaEmptyClassName: string;
  controlRailClassName: string;
}

export function useGroupCallPanelPresentation({
  session,
  status,
  error,
  accessGranted,
  callId,
  callHostUserId,
  userId,
  username,
  activeParticipantUserIds,
  remoteMedia,
  localRequestedMediaEncryptionMode,
  effectiveMediaEncryptionMode,
  effectiveFrameEncryptionEnabled,
  localMediaKey,
  sharedMediaKeyDeviceCount,
  receivedMediaKeyCount,
  isDetailsOpen,
  isSidePanelOpen,
  isStageFullscreen,
  pinnedStageTileId,
  suppressedStageTileIds,
  localStream,
  localScreenStream,
  isLocalAudioMuted,
  isLocalScreenSharing,
  isVideoSwitching,
  isScreenSwitching,
}: UseGroupCallPanelPresentationOptions): UseGroupCallPanelPresentationResult {
  const { t } = useI18n();

  const roomCode = callId ? formatGroupCallRoomCode(callId) : "........-......";
  const title = session ? t("group.call.title") : "";
  const lifecycleState = resolveGroupCallLifecycleState({
    sessionPresent: Boolean(session),
    status,
    accessGranted,
    remoteParticipantCount: remoteMedia.length,
    isVideoSwitching,
    isScreenSwitching,
  });

  const statusLabel = useMemo(
    () => resolveStatusLabel(lifecycleState, status, error, t),
    [error, lifecycleState, status, t]
  );
  const heroStatusLabel = resolveHeroStatusLabel(
    accessGranted,
    lifecycleState,
    status,
    statusLabel,
    t
  );
  const heroStatusTone = resolveHeroStatusTone(lifecycleState);

  const isLocalVideoEnabled = Boolean(localStream?.getVideoTracks().length);
  const hasVisibleVideo = isLocalVideoEnabled || isLocalScreenSharing || remoteMedia.some((participant) => participant.hasVideo);

  const sortedMembers = useMemo(() => {
    if (!session) return [];
    return [...session.members].sort((left, right) => left.username.localeCompare(right.username));
  }, [session]);

  const activeParticipantSet = useMemo(
    () => new Set(activeParticipantUserIds),
    [activeParticipantUserIds]
  );

  const memberNameByUserId = useMemo(() => buildMemberNameMap(session), [session]);

  const localIdentityLabel = username?.trim() ? username.trim() : t("group.call.localPreview");
  const localTileLabel = useMemo(() => {
    if (username?.trim()) {
      return `${t("group.call.localPreview")} / @${username}`;
    }
    return t("group.call.localPreview");
  }, [t, username]);

  const localVideoStatusLabel = resolveLocalVideoStatusLabel(
    isVideoSwitching,
    isScreenSwitching,
    isLocalScreenSharing,
    isLocalVideoEnabled,
    t
  );

  const mediaKeyModeLabel = useMemo(
    () => resolveMediaKeyModeLabel(effectiveMediaEncryptionMode, t),
    [effectiveMediaEncryptionMode, t]
  );

  const mediaModeDowngraded = useMemo(
    () => isGroupMediaModeDowngraded(localRequestedMediaEncryptionMode, effectiveMediaEncryptionMode),
    [effectiveMediaEncryptionMode, localRequestedMediaEncryptionMode]
  );

  const mediaKeyStatusLabel = useMemo(
    () => resolveMediaKeyStatusLabel(
      effectiveFrameEncryptionEnabled,
      localMediaKey,
      receivedMediaKeyCount,
      sharedMediaKeyDeviceCount,
      t
    ),
    [effectiveFrameEncryptionEnabled, localMediaKey, receivedMediaKeyCount, sharedMediaKeyDeviceCount, t]
  );

  const canEndForEveryone = Boolean(callId && callHostUserId === userId);

  const leaveActionLabel = callId ? t("group.call.leave") : t("group.call.close");
  const endForEveryoneLabel = t("group.call.endForEveryone");
  const detailsToggleLabel = isDetailsOpen
    ? t("group.call.hideDetails")
    : t("group.call.showDetails");
  const muteToggleLabel = isLocalAudioMuted ? t("call.unmute") : t("call.mute");
  const videoToggleLabel = isLocalVideoEnabled
    ? t("group.call.disableVideo")
    : t("group.call.enableVideo");
  const screenShareToggleLabel = isLocalScreenSharing
    ? t("group.call.stopScreenShare")
    : t("group.call.startScreenShare");

  const callTiles = useMemo<GroupCallStageTile[]>(() => {
    if (!session) {
      return [];
    }

    const localTiles = createLocalCallTiles(
      isLocalAudioMuted,
      isLocalScreenSharing,
      isLocalVideoEnabled,
      localScreenStream,
      localStream,
      localTileLabel,
      localIdentityLabel,
      localVideoStatusLabel,
      t
    );
    const remoteTiles = remoteMedia.map((participant) =>
      createRemoteCallTile(participant, memberNameByUserId, t)
    );
    return [...localTiles, ...remoteTiles];
  }, [
    isLocalAudioMuted,
    isLocalScreenSharing,
    isLocalVideoEnabled,
    localStream,
    localScreenStream,
    localTileLabel,
    localIdentityLabel,
    localVideoStatusLabel,
    memberNameByUserId,
    remoteMedia,
    session,
    t,
  ]);

  const stageSelectableTiles = useMemo(
    () => callTiles.filter((tile) => !suppressedStageTileIds.has(tile.id)),
    [callTiles, suppressedStageTileIds]
  );

  const stageTileId = useMemo(
    () => resolveGroupCallStageTileId(stageSelectableTiles, pinnedStageTileId),
    [stageSelectableTiles, pinnedStageTileId]
  );
  const stageTile = useMemo(
    () => stageSelectableTiles.find((tile) => tile.id === stageTileId) ?? null,
    [stageSelectableTiles, stageTileId]
  );
  const stripTiles = useMemo(
    () => callTiles.filter((tile) => tile.id !== stageTileId),
    [callTiles, stageTileId]
  );
  const hasPinnedStageSelection = hasPinnedStageTile(
    pinnedStageTileId,
    stageSelectableTiles
  );
  const forceCrowdedStageLayout = shouldForceCrowdedStageLayout(
    callTiles,
    hasPinnedStageSelection
  );
  const hasRemoteScreenShare = remoteMedia.some((participant) => participant.videoSource === "screen");
  const shouldUseStageLayout = shouldShowStageLayout(
    stageTile,
    hasPinnedStageSelection,
    forceCrowdedStageLayout
  );
  const galleryTiles = shouldUseStageLayout ? [] : callTiles;
  const isWaitingSoloAudioLayout = isWaitingSoloAudioGallery(
    galleryTiles,
    remoteMedia,
    isLocalScreenSharing,
    shouldUseStageLayout
  );
  const isCompactGalleryLayout = isCompactGallery(
    galleryTiles,
    isSidePanelOpen,
    isWaitingSoloAudioLayout,
    shouldUseStageLayout
  );
  const isAudioOnlyGalleryLayout = isAudioOnlyGallery(galleryTiles, shouldUseStageLayout);
  const isCrowdedGalleryLayout = isCrowdedGallery(
    galleryTiles,
    shouldUseStageLayout
  );
  const stageEyebrowLabel = stageTile?.videoSource === "screen"
    ? t("group.call.stage.screen")
    : t("group.call.stage.primary");
  const focusHintLabel = t("group.call.stage.focusHint");
  const fullscreenToggleLabel = isStageFullscreen
    ? t("group.call.stage.exitFullscreen")
    : t("group.call.stage.enterFullscreen");
  const resetStageFocusLabel = t("group.call.stage.autoFocus");
  const canToggleStageFullscreen = Boolean(
    stageTile?.hasVideo &&
    globalThis.document?.fullscreenEnabled
  );

  const groupInitials = getMemberInitials(session?.groupName ?? "");

  const shouldUseCompactBodyLayout = isWaitingSoloAudioLayout || isCompactGalleryLayout;
  const {
    bodyClassName,
    mediaGridClassName,
    mediaEmptyClassName,
    controlRailClassName,
  } = resolvePanelClassNames({
    galleryTiles,
    isAudioOnlyGalleryLayout,
    isCompactGalleryLayout,
    isCrowdedGalleryLayout,
    isWaitingSoloAudioLayout,
    shouldUseCompactBodyLayout,
  });

  return {
    lifecycleState,
    isReconnecting: lifecycleState === "reconnecting",
    roomCode,
    title,
    statusLabel,
    heroStatusLabel,
    heroStatusTone,
    isLocalVideoEnabled,
    hasVisibleVideo,
    sortedMembers,
    activeParticipantSet,
    localVideoStatusLabel,
    mediaKeyModeLabel,
    mediaModeDowngraded,
    mediaKeyStatusLabel,
    canEndForEveryone,
    leaveActionLabel,
    endForEveryoneLabel,
    detailsToggleLabel,
    muteToggleLabel,
    videoToggleLabel,
    screenShareToggleLabel,
    callTiles,
    stageTile,
    stripTiles,
    galleryTiles,
    hasPinnedStageSelection,
    hasRemoteScreenShare,
    shouldUseStageLayout,
    isWaitingSoloAudioLayout,
    isCrowdedGalleryLayout,
    stageEyebrowLabel,
    focusHintLabel,
    fullscreenToggleLabel,
    resetStageFocusLabel,
    canToggleStageFullscreen,
    groupInitials,
    shouldUseCompactBodyLayout,
    bodyClassName,
    mediaGridClassName,
    mediaEmptyClassName,
    controlRailClassName,
  };
}
