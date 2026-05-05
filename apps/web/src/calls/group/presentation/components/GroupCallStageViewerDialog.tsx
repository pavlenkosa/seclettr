import { lazy, Suspense } from "react";
import type { GroupCallStageTile } from "@/calls/group/model/group-call-types";

const LazyCallStageViewerDialog = lazy(() =>
  import("@/calls/shared/presentation/CallStageViewerDialog").then(({ CallStageViewerDialog }) => ({
    default: CallStageViewerDialog,
  }))
);

export interface GroupCallStageViewerDialogProps {
  readonly isOpen: boolean;
  readonly stageTile: GroupCallStageTile | null;
  readonly stageEyebrowLabel: string;
  readonly enterFullscreenLabel: string;
  readonly exitFullscreenLabel: string;
  readonly closeViewerLabel: string;
  readonly canStopWatchingStageTile: boolean;
  readonly stopWatchingStageLabel?: string;
  readonly onClose: () => void;
  readonly onStopWatchingStageTile: (tileId: string) => void;
}

export function GroupCallStageViewerDialog({
  isOpen,
  stageTile,
  stageEyebrowLabel,
  enterFullscreenLabel,
  exitFullscreenLabel,
  closeViewerLabel,
  canStopWatchingStageTile,
  stopWatchingStageLabel,
  onClose,
  onStopWatchingStageTile,
}: GroupCallStageViewerDialogProps) {
  if (!isOpen || !stageTile?.hasVideo) {
    return null;
  }

  return (
    <Suspense fallback={null}>
      <LazyCallStageViewerDialog
        isOpen={isOpen}
        stream={stageTile.stream}
        title={stageTile.label}
        eyebrow={stageEyebrowLabel}
        emptyLabel={stageTile.badge || stageEyebrowLabel}
        dialogAriaLabel={stageTile.label}
        enterFullscreenLabel={enterFullscreenLabel}
        exitFullscreenLabel={exitFullscreenLabel}
        closeLabel={closeViewerLabel}
        stopWatchingLabel={canStopWatchingStageTile ? stopWatchingStageLabel : undefined}
        onClose={onClose}
        onStopWatching={
          canStopWatchingStageTile
            ? () => onStopWatchingStageTile(stageTile.id)
            : undefined
        }
      />
    </Suspense>
  );
}
