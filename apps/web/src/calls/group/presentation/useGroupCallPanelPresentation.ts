import { useMemo } from "react";
import { useI18n } from "@/i18n";
import type { LocalGroupCallMediaKey } from "@/calls/group/runtime/group-call/media-key";
import type { GroupCallRemoteMedia } from "@/calls/group/runtime/sfu";
import { type StatusBadgeTone } from "@/components/ui";

import styles from "@/calls/group/presentation/GroupCallPanel.module.css";
import {
  isGroupMediaModeDowngraded,
  type GroupCallRuntimeMediaEncryptionMode,
} from "@/calls/group/runtime/group-call/media-encryption-negotiation";
import { resolveGroupCallStageTileId } from "@/calls/group/model/group-call-stage";
import type {
  GroupCallPanelSession,
  GroupCallStageTile,
  GroupCallStatus,
} from "@/calls/group/model/group-call-types";
import {
  isGroupCallConnectedLifecycleState,
  resolveGroupCallLifecycleState,
  type GroupCallLifecycleState,
} from "@/calls/group/model/group-call-lifecycle";
import { getMemberInitials } from "@/calls/group/presentation/display";
import { formatGroupCallRoomCode } from "@/calls/group/presentation/group-call-panel-surface";

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
  actionsClassName: string;
}

type Translate = ReturnType<typeof useI18n>["t"];

function resolveStatusLabel(
  lifecycleState: GroupCallLifecycleState,
  status: GroupCallStatus,
  error: string | null,
  t: Translate
): string {
  if (lifecycleState === "leaving") {
    return status === "ending" ? t("group.call.ending") : t("group.call.leaving");
  }
  if (lifecycleState === "failed") return error ?? t("group.call.error.startFailed");
  if (lifecycleState === "reconnecting") return t("group.call.reconnecting");
  if (lifecycleState === "room_idle" || lifecycleState === "joining") return t("group.call.starting");
  return t("group.call.ready");
}

function resolveHeroStatusLabel(
  accessGranted: boolean,
  lifecycleState: GroupCallLifecycleState,
  status: GroupCallStatus,
  statusLabel: string,
  t: Translate
): string {
  if (lifecycleState === "failed" || status === "ending") {
    return statusLabel;
  }

  if (lifecycleState === "reconnecting") {
    return t("group.call.reconnecting");
  }

  return accessGranted
    ? t("group.call.accessReady")
    : t("group.call.accessPending");
}

function resolveHeroStatusTone(lifecycleState: GroupCallLifecycleState): StatusBadgeTone {
  if (lifecycleState === "failed") {
    return "danger";
  }

  return isGroupCallConnectedLifecycleState(lifecycleState)
    ? "success"
    : "warning";
}

function resolveLocalVideoStatusLabel(
  isVideoSwitching: boolean,
  isScreenSwitching: boolean,
  isLocalScreenSharing: boolean,
  isLocalVideoEnabled: boolean,
  t: Translate
): string {
  if (isVideoSwitching) return t("group.call.videoStarting");
  if (isScreenSwitching) return t("group.call.screenStarting");
  if (isLocalScreenSharing) return t("group.call.screenSharing");
  return isLocalVideoEnabled
    ? t("group.call.videoOn")
    : t("group.call.audioOnly");
}

function resolveMediaKeyModeLabel(
  effectiveMediaEncryptionMode: GroupCallRuntimeMediaEncryptionMode,
  t: Translate
): string {
  if (effectiveMediaEncryptionMode === "required") return t("settings.callSecurity.strict");
  if (effectiveMediaEncryptionMode === "best-effort") return t("settings.callSecurity.balanced");
  return t("settings.callSecurity.compatibility");
}

function resolveMediaKeyStatusLabel(
  effectiveFrameEncryptionEnabled: boolean,
  localMediaKey: LocalGroupCallMediaKey | null,
  receivedMediaKeyCount: number,
  sharedMediaKeyDeviceCount: number,
  t: Translate
): string {
  if (!effectiveFrameEncryptionEnabled) return t("group.call.mediaKeyDisabled");
  if (!localMediaKey) return t("group.call.mediaKeyPending");
  return receivedMediaKeyCount > 0 || sharedMediaKeyDeviceCount > 0
    ? t("group.call.mediaKeyReady")
    : t("group.call.mediaKeyPending");
}

function resolveRemoteTileBadge(
  participant: GroupCallRemoteMedia,
  t: Translate
): string {
  if (!participant.hasVideo) {
    return t("group.call.audioOnly");
  }

  return participant.videoSource === "screen"
    ? t("group.call.screenSharing")
    : t("group.call.videoOn");
}

function createRemoteCallTile(
  participant: GroupCallRemoteMedia,
  memberNameByUserId: Map<string, string>,
  t: Translate
): GroupCallStageTile {
  const remoteName = memberNameByUserId.get(participant.userId) ?? participant.userId.slice(0, 8);
  return {
    id: participant.mediaId,
    label: `@${remoteName}`,
    stream: participant.videoStream,
    audioStream: participant.audioStream,
    fallbackInitials: getMemberInitials(remoteName),
    badge: resolveRemoteTileBadge(participant, t),
    hasVideo: participant.hasVideo,
    videoSource: participant.videoSource,
    isLocal: false,
  };
}

function createLocalCallTiles(
  isLocalScreenSharing: boolean,
  isLocalVideoEnabled: boolean,
  localScreenStream: MediaStream | null,
  localStream: MediaStream | null,
  localTileLabel: string,
  localVideoStatusLabel: string,
  t: Translate
): GroupCallStageTile[] {
  const localFallbackInitials = getMemberInitials(localTileLabel.replace(/^@/, ""));
  const tiles: GroupCallStageTile[] = [];

  if (isLocalVideoEnabled) {
    tiles.push({
      id: "local:camera",
      label: localTileLabel,
      stream: localStream,
      audioStream: null,
      fallbackInitials: localFallbackInitials,
      badge: t("group.call.videoOn"),
      hasVideo: true,
      videoSource: "camera",
      isLocal: true,
    });
  }

  if (isLocalScreenSharing && localScreenStream) {
    tiles.push({
      id: "local:screen",
      label: localTileLabel,
      stream: localScreenStream,
      audioStream: null,
      fallbackInitials: localFallbackInitials,
      badge: t("group.call.screenSharing"),
      hasVideo: true,
      videoSource: "screen",
      isLocal: true,
    });
  }

  if (!isLocalVideoEnabled && !isLocalScreenSharing) {
    tiles.push({
      id: "local:audio",
      label: localTileLabel,
      stream: null,
      audioStream: null,
      fallbackInitials: localFallbackInitials,
      badge: localVideoStatusLabel,
      hasVideo: false,
      videoSource: null,
      isLocal: true,
    });
  }

  return tiles;
}

function joinClassNames(values: Array<string | undefined>): string {
  return values.filter(Boolean).join(" ");
}

function appendClassName(base: string | undefined, extra?: string): string {
  return joinClassNames([base, extra]);
}

function hasPinnedStageTile(
  pinnedStageTileId: string | null,
  stageSelectableTiles: GroupCallStageTile[]
): boolean {
  return Boolean(
    pinnedStageTileId &&
    stageSelectableTiles.some((tile) => tile.id === pinnedStageTileId)
  );
}

function shouldShowStageLayout(
  stageTile: GroupCallStageTile | null,
  hasPinnedStageSelection: boolean,
  forceCrowdedStageLayout: boolean
): boolean {
  if (forceCrowdedStageLayout) {
    return Boolean(stageTile?.hasVideo);
  }

  return Boolean(
    stageTile &&
    (hasPinnedStageSelection || stageTile.videoSource === "screen")
  );
}

function isWaitingSoloAudioGallery(
  galleryTiles: GroupCallStageTile[],
  remoteMedia: GroupCallRemoteMedia[],
  isLocalScreenSharing: boolean,
  shouldUseStageLayout: boolean
): boolean {
  return Boolean(
    !shouldUseStageLayout &&
    galleryTiles.length === 1 &&
    remoteMedia.length === 0 &&
    !galleryTiles[0]?.hasVideo &&
    !isLocalScreenSharing
  );
}

function isCompactGallery(
  galleryTiles: GroupCallStageTile[],
  isSidePanelOpen: boolean,
  isWaitingSoloAudioLayout: boolean,
  shouldUseStageLayout: boolean
): boolean {
  return Boolean(
    !shouldUseStageLayout &&
    !isWaitingSoloAudioLayout &&
    !isSidePanelOpen &&
    galleryTiles.length > 0 &&
    galleryTiles.length <= 4
  );
}

function isAudioOnlyGallery(
  galleryTiles: GroupCallStageTile[],
  shouldUseStageLayout: boolean
): boolean {
  return Boolean(
    !shouldUseStageLayout &&
    galleryTiles.length > 0 &&
    galleryTiles.every((tile) => !tile.hasVideo)
  );
}

function isCrowdedGallery(
  galleryTiles: GroupCallStageTile[],
  shouldUseStageLayout: boolean
): boolean {
  return !shouldUseStageLayout && galleryTiles.length >= 6;
}

function shouldForceCrowdedStageLayout(
  callTiles: GroupCallStageTile[],
  hasPinnedStageSelection: boolean
): boolean {
  if (hasPinnedStageSelection) {
    return false;
  }

  if (callTiles.length < 6) {
    return false;
  }

  return callTiles.some((tile) => tile.hasVideo);
}

function resolvePanelClassNames(params: {
  galleryTiles: GroupCallStageTile[];
  isAudioOnlyGalleryLayout: boolean;
  isCompactGalleryLayout: boolean;
  isCrowdedGalleryLayout: boolean;
  isWaitingSoloAudioLayout: boolean;
  shouldUseCompactBodyLayout: boolean;
}): Pick<
  UseGroupCallPanelPresentationResult,
  | "bodyClassName"
  | "mediaGridClassName"
  | "mediaEmptyClassName"
  | "controlRailClassName"
  | "actionsClassName"
> {
  const {
    galleryTiles,
    isAudioOnlyGalleryLayout,
    isCompactGalleryLayout,
    isCrowdedGalleryLayout,
    isWaitingSoloAudioLayout,
    shouldUseCompactBodyLayout,
  } = params;

  return {
    bodyClassName: appendClassName(
      styles.body,
      shouldUseCompactBodyLayout ? styles.bodyCompact : undefined
    ),
    mediaGridClassName: joinClassNames([
      styles.mediaGrid,
      galleryTiles.length === 1 ? styles.mediaGridSolo : "",
      isCompactGalleryLayout ? styles.mediaGridCompact : "",
      isWaitingSoloAudioLayout ? styles.mediaGridSoloWaiting : "",
      isAudioOnlyGalleryLayout ? styles.mediaGridAudioOnly : "",
      isCrowdedGalleryLayout ? styles.mediaGridCrowded : "",
      isCrowdedGalleryLayout && galleryTiles.length >= 9
        ? styles.mediaGridCrowdedHeavy
        : "",
    ]),
    mediaEmptyClassName: appendClassName(
      styles.mediaEmpty,
      shouldUseCompactBodyLayout ? styles.mediaEmptyCompact : undefined
    ),
    controlRailClassName: appendClassName(
      styles.controlRail,
      shouldUseCompactBodyLayout ? styles.controlRailCompact : undefined
    ),
    actionsClassName: appendClassName(
      styles.actions,
      shouldUseCompactBodyLayout ? styles.actionsCompact : undefined
    ),
  };
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

  const memberNameByUserId = useMemo(() => {
    const entries = session
      ? session.members.map((member) => [member.userId, member.username] as const)
      : [];
    return new Map(entries);
  }, [session]);

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
      isLocalScreenSharing,
      isLocalVideoEnabled,
      localScreenStream,
      localStream,
      localTileLabel,
      localVideoStatusLabel,
      t
    );
    const remoteTiles = remoteMedia.map((participant) =>
      createRemoteCallTile(participant, memberNameByUserId, t)
    );
    return [...localTiles, ...remoteTiles];
  }, [
    isLocalScreenSharing,
    isLocalVideoEnabled,
    localStream,
    localScreenStream,
    localTileLabel,
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
    actionsClassName,
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
    actionsClassName,
  };
}
