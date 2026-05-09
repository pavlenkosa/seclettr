import { useI18n } from "@/i18n";
import type { GroupCallStageTile } from "@/calls/group/model/group-call-types";
import { InlineNotice } from "@/components/ui";

import { GroupCallMediaTile } from "./GroupCallMediaTile";
import { GroupCallStageArea } from "./GroupCallStageArea";
import { GroupCallStageStrip } from "./GroupCallStageStrip";
import { GroupCallStageViewerDialog } from "./GroupCallStageViewerDialog";
import styles from "@/calls/group/presentation/GroupCallPanel.module.css";

interface GroupCallMediaSectionProps {
  readonly stageShellRef: React.RefObject<HTMLDivElement>;
  readonly shouldUseStageLayout: boolean;
  readonly stageTile: GroupCallStageTile | null;
  readonly stripTiles: GroupCallStageTile[];
  readonly galleryTiles: GroupCallStageTile[];
  readonly hasPinnedStageSelection: boolean;
  readonly canToggleStageFullscreen: boolean;
  readonly isStageViewerOpen: boolean;
  readonly isCompactStagePreview: boolean;
  readonly isWaitingSoloAudioLayout: boolean;
  readonly isCrowdedGalleryLayout: boolean;
  readonly localVideoStatusLabel: string;
  readonly stageEyebrowLabel: string;
  readonly focusHintLabel: string;
  readonly enterFullscreenLabel: string;
  readonly exitFullscreenLabel: string;
  readonly closeViewerLabel: string;
  readonly resetStageFocusLabel: string;
  readonly mediaGridClassName: string;
  readonly mediaEmptyClassName: string;
  readonly hasRemoteScreenShare: boolean;
  readonly remoteMediaCount: number;
  readonly onResetStageFocus: () => void;
  readonly onStopWatchingStageTile: (tileId: string) => void;
  readonly onToggleStageFullscreen: () => void | Promise<void>;
  readonly onSelectTile: (tileId: string) => void;
}

export function GroupCallMediaSection({
  stageShellRef,
  shouldUseStageLayout,
  stageTile,
  stripTiles,
  galleryTiles,
  hasPinnedStageSelection,
  canToggleStageFullscreen,
  isStageViewerOpen,
  isCompactStagePreview,
  isWaitingSoloAudioLayout,
  isCrowdedGalleryLayout,
  localVideoStatusLabel: _localVideoStatusLabel,
  stageEyebrowLabel,
  focusHintLabel,
  enterFullscreenLabel,
  exitFullscreenLabel,
  closeViewerLabel,
  resetStageFocusLabel,
  mediaGridClassName,
  mediaEmptyClassName,
  hasRemoteScreenShare,
  remoteMediaCount,
  onResetStageFocus,
  onStopWatchingStageTile,
  onToggleStageFullscreen,
  onSelectTile,
}: GroupCallMediaSectionProps) {
  const { t } = useI18n();
  const isWaitingForRemoteMedia = remoteMediaCount === 0 && !hasRemoteScreenShare;
  const canStopWatchingStageTile = Boolean(
    stageTile &&
    !stageTile.isLocal &&
    stageTile.hasVideo &&
    (stageTile.videoSource === "camera" || stageTile.videoSource === "screen")
  );
  const stopWatchingStageLabel = stageTile?.videoSource === "screen"
    ? t("group.call.stage.stopWatchingScreen")
    : t("group.call.stage.stopWatchingCamera");
  const stageViewerToggleHandler = () => {
    void onToggleStageFullscreen();
  };

  return (
    <section className={styles.section}>
      {(shouldUseStageLayout || galleryTiles.length >= 2) ? (
        <div className={`${styles.sectionHeader} ${styles.sectionHeaderCentered}`}>
          <div className={styles.sectionLabel}>{t("group.call.mediaSection")}</div>
          {shouldUseStageLayout ? (
            <div className={styles.mediaToolbarHint}>{focusHintLabel}</div>
          ) : null}
        </div>
      ) : null}
      {isWaitingForRemoteMedia && !isWaitingSoloAudioLayout ? (
        <InlineNotice className={styles.mediaNotice} tone="info" size="md">
          {t("group.call.noRemoteMedia")}
        </InlineNotice>
      ) : null}
      {shouldUseStageLayout && stageTile ? (
        <GroupCallStageArea
          stageShellRef={stageShellRef}
          stageTile={stageTile}
          hasPinnedStageSelection={hasPinnedStageSelection}
          canToggleStagePresentation={canToggleStageFullscreen}
          isCompactStagePreview={isCompactStagePreview}
          stageEyebrowLabel={stageEyebrowLabel}
          fullscreenToggleLabel={enterFullscreenLabel}
          resetStageFocusLabel={resetStageFocusLabel}
          canStopWatchingStageTile={canStopWatchingStageTile}
          stopWatchingStageLabel={stopWatchingStageLabel}
          onResetStageFocus={onResetStageFocus}
          onToggleStagePresentation={onToggleStageFullscreen}
          onStopWatchingStageTile={onStopWatchingStageTile}
        />
      ) : null}
      {shouldUseStageLayout ? (
        <GroupCallStageStrip
          stripTiles={stripTiles}
          focusHintLabel={focusHintLabel}
          onSelectTile={onSelectTile}
        />
      ) : null}
      {!shouldUseStageLayout && galleryTiles.length > 0 ? (
        <div className={mediaGridClassName}>
          {galleryTiles.map((tile) => (
            <GroupCallMediaTile
              key={tile.id}
              label={tile.label}
              stream={tile.stream}
              audioStream={tile.audioStream}
              hasAudio={tile.hasAudio}
              fallbackInitials={tile.fallbackInitials}
              badge={tile.badge}
              muted={tile.isLocal}
              videoSource={tile.videoSource}
              variant={
                isCrowdedGalleryLayout
                  || (!tile.hasVideo && !isWaitingSoloAudioLayout && galleryTiles.length > 4)
                  ? "strip"
                  : "stage"
              }
              onSelect={tile.hasVideo ? () => onSelectTile(tile.id) : undefined}
              interactiveLabel={tile.hasVideo ? focusHintLabel : undefined}
            />
          ))}
        </div>
      ) : null}
      {!isWaitingForRemoteMedia && remoteMediaCount === 0 && !hasRemoteScreenShare ? (
        <div className={mediaEmptyClassName}>{t("group.call.noRemoteMedia")}</div>
      ) : null}
      <GroupCallStageViewerDialog
        isOpen={isStageViewerOpen}
        stageTile={stageTile}
        stageEyebrowLabel={stageEyebrowLabel}
        enterFullscreenLabel={enterFullscreenLabel}
        exitFullscreenLabel={exitFullscreenLabel}
        closeViewerLabel={closeViewerLabel}
        canStopWatchingStageTile={canStopWatchingStageTile}
        stopWatchingStageLabel={stopWatchingStageLabel}
        onClose={stageViewerToggleHandler}
        onStopWatchingStageTile={onStopWatchingStageTile}
      />
    </section>
  );
}
