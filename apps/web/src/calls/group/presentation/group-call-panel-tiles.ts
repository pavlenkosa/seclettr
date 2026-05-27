/**
 * group-call-panel-tiles — GroupCallStageTile construction and gallery layout helpers.
 *
 * Owns:
 *   - resolveRemoteTileBadge — maps remote media to a localised badge label
 *   - createRemoteCallTile — builds a GroupCallStageTile from a GroupCallRemoteMedia entry
 *   - createLocalCallTiles — builds local camera and/or screen-share tiles from local state
 *   - buildMemberNameMap — creates a userId → username lookup from the session member list
 *   - Layout predicates: isCompactGallery, isAudioOnlyGallery, isCrowdedGallery,
 *     isWaitingSoloAudioGallery, hasPinnedStageTile, shouldShowStageLayout,
 *     shouldForceCrowdedStageLayout
 *   - resolvePanelClassNames — maps layout flags to CSS class-name strings
 *
 * Does not own stage tile selection (see group-call-stage.ts) or presentation
 * composition (see useGroupCallPanelPresentation.ts).
 */
import type { GroupCallRemoteMedia } from "@/calls/group/runtime";
import type {
  GroupCallPanelSession,
  GroupCallStageTile,
} from "@/calls/group/model/group-call-types";
import { getMemberInitials } from "@/calls/group/presentation/display";
import type { useI18n } from "@/i18n";

import styles from "@/calls/group/presentation/GroupCallPanel.module.css";

type Translate = ReturnType<typeof useI18n>["t"];

export function resolveRemoteTileBadge(
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

export function createRemoteCallTile(
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
    hasAudio: participant.hasAudio || hasLiveAudioTrack(participant.audioStream),
    hasVideo: participant.hasVideo,
    videoSource: participant.videoSource,
    isLocal: false,
  };
}

function hasLiveAudioTrack(stream: MediaStream | null): boolean {
  return Boolean(stream?.getAudioTracks().some((track) => track.readyState === "live"));
}

export function createLocalCallTiles(
  isLocalAudioMuted: boolean,
  isLocalScreenSharing: boolean,
  isLocalVideoEnabled: boolean,
  localScreenStream: MediaStream | null,
  localStream: MediaStream | null,
  localTileLabel: string,
  localIdentityLabel: string,
  localVideoStatusLabel: string,
  t: Translate
): GroupCallStageTile[] {
  const localFallbackInitials = getMemberInitials(localIdentityLabel.replace(/^@/, ""));
  const localHasAudio = !isLocalAudioMuted && hasLiveAudioTrack(localStream);
  const tiles: GroupCallStageTile[] = [];

  if (isLocalVideoEnabled) {
    tiles.push({
      id: "local:camera",
      label: localTileLabel,
      stream: localStream,
      audioStream: localStream,
      fallbackInitials: localFallbackInitials,
      badge: t("group.call.videoOn"),
      hasAudio: localHasAudio,
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
      audioStream: !isLocalVideoEnabled ? localStream : null,
      fallbackInitials: localFallbackInitials,
      badge: t("group.call.screenSharing"),
      hasAudio: !isLocalVideoEnabled && localHasAudio,
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
      audioStream: localStream,
      fallbackInitials: localFallbackInitials,
      badge: localVideoStatusLabel,
      hasAudio: localHasAudio,
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

export function hasPinnedStageTile(
  pinnedStageTileId: string | null,
  stageSelectableTiles: GroupCallStageTile[]
): boolean {
  return Boolean(
    pinnedStageTileId &&
    stageSelectableTiles.some((tile) => tile.id === pinnedStageTileId)
  );
}

export function shouldShowStageLayout(
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

export function isWaitingSoloAudioGallery(
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

export function isCompactGallery(
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

export function isAudioOnlyGallery(
  galleryTiles: GroupCallStageTile[],
  shouldUseStageLayout: boolean
): boolean {
  return Boolean(
    !shouldUseStageLayout &&
    galleryTiles.length > 0 &&
    galleryTiles.every((tile) => !tile.hasVideo)
  );
}

export function isCrowdedGallery(
  galleryTiles: GroupCallStageTile[],
  shouldUseStageLayout: boolean
): boolean {
  return !shouldUseStageLayout && galleryTiles.length >= 6;
}

export function shouldForceCrowdedStageLayout(
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

export function resolvePanelClassNames(params: {
  galleryTiles: GroupCallStageTile[];
  isAudioOnlyGalleryLayout: boolean;
  isCompactGalleryLayout: boolean;
  isCrowdedGalleryLayout: boolean;
  isWaitingSoloAudioLayout: boolean;
  shouldUseCompactBodyLayout: boolean;
}): {
  bodyClassName: string;
  mediaGridClassName: string;
  mediaEmptyClassName: string;
  controlRailClassName: string;
} {
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
  };
}

export function buildMemberNameMap(session: GroupCallPanelSession | null): Map<string, string> {
  const entries = session
    ? session.members.map((member) => [member.userId, member.username] as const)
    : [];
  return new Map(entries);
}
