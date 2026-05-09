import type { RefObject } from "react";
import type { GroupCallStageTile } from "@/calls/group/model/group-call-types";
import { CloseIcon, ExpandIcon, FocusIcon } from "@/calls/shared/presentation/CallIcons";
import { IconButton } from "@/components/ui";

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
  readonly canStopWatchingStageTile: boolean;
  readonly stopWatchingStageLabel?: string;
  readonly fullscreenToggleLabel: string;
  readonly resetStageFocusLabel: string;
  readonly onResetStageFocus: () => void;
  readonly onToggleStagePresentation: () => void | Promise<void>;
  readonly onStopWatchingStageTile: () => void;
}

function GroupCallStageActions({
  hasPinnedStageSelection,
  canToggleStagePresentation,
  canStopWatchingStageTile,
  stopWatchingStageLabel,
  fullscreenToggleLabel,
  resetStageFocusLabel,
  onResetStageFocus,
  onToggleStagePresentation,
  onStopWatchingStageTile,
}: GroupCallStageActionsProps) {
  const hasActions = hasPinnedStageSelection || canStopWatchingStageTile || canToggleStagePresentation;
  if (!hasActions) return null;

  return (
    <div className={styles.stageActionRail}>
      {hasPinnedStageSelection ? (
        <IconButton
          onClick={onResetStageFocus}
          className={styles.stageActionIconBtn}
          size={34}
          aria-label={resetStageFocusLabel}
          title={resetStageFocusLabel}
        >
          <FocusIcon />
        </IconButton>
      ) : null}
      {canStopWatchingStageTile && stopWatchingStageLabel ? (
        <IconButton
          onClick={onStopWatchingStageTile}
          className={styles.stageActionIconBtn}
          size={34}
          aria-label={stopWatchingStageLabel}
          title={stopWatchingStageLabel}
        >
          <CloseIcon />
        </IconButton>
      ) : null}
      {canToggleStagePresentation ? (
        <IconButton
          onClick={() => { void onToggleStagePresentation(); }}
          className={styles.stageActionIconBtn}
          size={34}
          aria-label={fullscreenToggleLabel}
          title={fullscreenToggleLabel}
        >
          <ExpandIcon />
        </IconButton>
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
  stageEyebrowLabel: _stageEyebrowLabel,
  fullscreenToggleLabel,
  resetStageFocusLabel,
  canStopWatchingStageTile,
  stopWatchingStageLabel,
  onResetStageFocus,
  onToggleStagePresentation,
  onStopWatchingStageTile,
}: GroupCallStageAreaProps) {
  const handleSelectCompactStagePreview = isCompactStagePreview && stageTile.hasVideo
    ? () => { void onToggleStagePresentation(); }
    : undefined;

  return (
    <div ref={stageShellRef} className={styles.stageShell}>
      <GroupCallMediaTile
        label={stageTile.label}
        stream={stageTile.stream}
        audioStream={stageTile.audioStream}
        hasAudio={stageTile.hasAudio}
        fallbackInitials={stageTile.fallbackInitials}
        badge={stageTile.badge}
        muted={stageTile.isLocal}
        variant="stage"
        className={isCompactStagePreview ? styles.mediaTileScreenPreviewCompact : undefined}
        videoSource={stageTile.videoSource}
        onSelect={handleSelectCompactStagePreview}
        interactiveLabel={isCompactStagePreview ? fullscreenToggleLabel : undefined}
      >
        <GroupCallStageActions
          hasPinnedStageSelection={hasPinnedStageSelection}
          canToggleStagePresentation={canToggleStagePresentation}
          canStopWatchingStageTile={canStopWatchingStageTile}
          stopWatchingStageLabel={stopWatchingStageLabel}
          fullscreenToggleLabel={fullscreenToggleLabel}
          resetStageFocusLabel={resetStageFocusLabel}
          onResetStageFocus={onResetStageFocus}
          onToggleStagePresentation={onToggleStagePresentation}
          onStopWatchingStageTile={() => onStopWatchingStageTile(stageTile.id)}
        />
      </GroupCallMediaTile>
    </div>
  );
}
