import { useRef } from "react";
import { createPortal } from "react-dom";
import type { GroupCallStageTile } from "@/calls/group/model/group-call-types";
import { useCallDialogFocusTrap } from "@/calls/shared/presentation/useCallDialogFocusTrap";

import { GroupCallMediaTile } from "./GroupCallMediaTile";
import styles from "@/calls/group/presentation/GroupCallPanel.module.css";

export interface GroupCallStageViewerDialogProps {
  readonly isOpen: boolean;
  readonly stageTile: GroupCallStageTile | null;
  readonly stageEyebrowLabel: string;
  readonly fullscreenToggleLabel: string;
  readonly canStopWatchingStageTile: boolean;
  readonly stopWatchingStageLabel?: string;
  readonly onClose: () => void;
  readonly onStopWatchingStageTile: (tileId: string) => void;
}

export function GroupCallStageViewerDialog({
  isOpen,
  stageTile,
  stageEyebrowLabel,
  fullscreenToggleLabel,
  canStopWatchingStageTile,
  stopWatchingStageLabel,
  onClose,
  onStopWatchingStageTile,
}: GroupCallStageViewerDialogProps) {
  const containerRef = useRef<HTMLDialogElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useCallDialogFocusTrap({
    isOpen,
    containerRef,
    initialFocusRef: closeButtonRef,
    onClose,
    closeOnEscape: true,
    trapTab: true,
  });

  if (!isOpen || !stageTile?.hasVideo) {
    return null;
  }

  // Portals to document.body to escape the panel's animation transform (scale(1)),
  // which persists via fill-mode:both and creates a new CSS containing block for
  // position:fixed descendants, clipping the overlay to the panel instead of the viewport.
  return createPortal(
    <dialog
      ref={containerRef}
      open
      className={styles.stageViewerOverlay}
      aria-modal="true"
      aria-label={stageTile.label}
      data-call-nested-dialog="true"
    >
      <div className={styles.stageViewerHeader}>
        <div className={styles.stageViewerMeta}>
          <span className={styles.stageEyebrow}>{stageEyebrowLabel}</span>
          <span className={styles.stageTitle}>{stageTile.label}</span>
        </div>
        <div className={styles.stageActions}>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className={styles.stageActionBtn}
          >
            {fullscreenToggleLabel}
          </button>
        </div>
      </div>
      <div className={styles.stageViewerBody}>
        <GroupCallMediaTile
          label={stageTile.label}
          stream={stageTile.stream}
          audioStream={stageTile.audioStream}
          fallbackInitials={stageTile.fallbackInitials}
          badge={stageTile.badge}
          muted={stageTile.isLocal}
          variant="viewer"
          videoSource={stageTile.videoSource}
          onStopWatching={
            canStopWatchingStageTile
              ? () => onStopWatchingStageTile(stageTile.id)
              : undefined
          }
          stopWatchingLabel={canStopWatchingStageTile ? stopWatchingStageLabel : undefined}
        />
      </div>
    </dialog>,
    document.body
  );
}
