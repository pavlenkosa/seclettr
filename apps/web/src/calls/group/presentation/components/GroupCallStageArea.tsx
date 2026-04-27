import type { RefObject } from "react";
import type { GroupCallStageTile } from "@/calls/group/model/group-call-types";

import { GroupCallMediaTile } from "./GroupCallMediaTile";
import styles from "@/calls/group/presentation/GroupCallPanel.module.css";

export interface GroupCallStageAreaProps {
  readonly stageShellRef: RefObject<HTMLDivElement>;
  readonly stageTile: GroupCallStageTile;
  readonly hasPinnedStageSelection: boolean;
  readonly canToggleStagePresentation: boolean;
  readonly isCompactStagePreview: boolean;
  readonly stageEyebrowLabel: string;
  readonly fullscreenToggleLabel: string;
  readonly resetStageFocusLabel: string;
  readonly canStopWatchingStageTile: boolean;
  readonly stopWatchingStageLabel?: string;
  readonly onResetStageFocus: () => void;
  readonly onToggleStagePresentation: () => void | Promise<void>;
  readonly onStopWatchingStageTile: (tileId: string) => void;
}

interface GroupCallStageActionsProps {
  readonly hasPinnedStageSelection: boolean;
  readonly canToggleStagePresentation: boolean;
  readonly fullscreenToggleLabel: string;
  readonly resetStageFocusLabel: string;
  readonly onResetStageFocus: () => void;
  readonly onToggleStagePresentation: () => void | Promise<void>;
}

function GroupCallStageActions({
  hasPinnedStageSelection,
  canToggleStagePresentation,
  fullscreenToggleLabel,
  resetStageFocusLabel,
  onResetStageFocus,
  onToggleStagePresentation,
}: GroupCallStageActionsProps) {
  return (
    <div className={styles.stageActions}>
      {hasPinnedStageSelection ? (
        <button
          type="button"
          onClick={onResetStageFocus}
          className={styles.stageActionBtn}
        >
          {resetStageFocusLabel}
        </button>
      ) : null}
      {canToggleStagePresentation ? (
        <button
          type="button"
          onClick={() => { onToggleStagePresentation(); }}
          className={styles.stageActionBtn}
        >
          {fullscreenToggleLabel}
        </button>
      ) : null}
    </div>
  );
}

export function GroupCallStageArea({
  stageShellRef,
  stageTile,
  hasPinnedStageSelection,
  canToggleStagePresentation,
  isCompactStagePreview,
  stageEyebrowLabel,
  fullscreenToggleLabel,
  resetStageFocusLabel,
  canStopWatchingStageTile,
  stopWatchingStageLabel,
  onResetStageFocus,
  onToggleStagePresentation,
  onStopWatchingStageTile,
}: GroupCallStageAreaProps) {
  const handleSelectCompactStagePreview = isCompactStagePreview && stageTile.hasVideo
    ? () => { onToggleStagePresentation(); }
    : undefined;

  return (
    <div ref={stageShellRef} className={styles.stageShell}>
      <div className={styles.stageBar}>
        <div className={styles.stageMeta}>
          <span className={styles.stageEyebrow}>{stageEyebrowLabel}</span>
          <span className={styles.stageTitle}>{stageTile.label}</span>
        </div>
        <GroupCallStageActions
          hasPinnedStageSelection={hasPinnedStageSelection}
          canToggleStagePresentation={canToggleStagePresentation}
          fullscreenToggleLabel={fullscreenToggleLabel}
          resetStageFocusLabel={resetStageFocusLabel}
          onResetStageFocus={onResetStageFocus}
          onToggleStagePresentation={onToggleStagePresentation}
        />
      </div>
      <GroupCallMediaTile
        label={stageTile.label}
        stream={stageTile.stream}
        audioStream={stageTile.audioStream}
        fallbackInitials={stageTile.fallbackInitials}
        badge={stageTile.badge}
        muted={stageTile.isLocal}
        variant="stage"
        className={isCompactStagePreview ? styles.mediaTileScreenPreviewCompact : undefined}
        videoSource={stageTile.videoSource}
        onSelect={handleSelectCompactStagePreview}
        onStopWatching={
          canStopWatchingStageTile
            ? () => onStopWatchingStageTile(stageTile.id)
            : undefined
        }
        stopWatchingLabel={canStopWatchingStageTile ? stopWatchingStageLabel : undefined}
        interactiveLabel={isCompactStagePreview ? fullscreenToggleLabel : undefined}
      />
    </div>
  );
}
