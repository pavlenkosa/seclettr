import { lazy, Suspense } from "react";
import type { GroupCallStageTile } from "@/calls/group/model/group-call-types";
import { CameraIcon, ScreenShareIcon } from "@/calls/shared/presentation/CallIcons";

const LazyCallStageViewerDialog = lazy(() =>
  import("@/calls/shared/presentation/CallStageViewerDialog").then(({ CallStageViewerDialog }) => ({
    default: CallStageViewerDialog,
  }))
);

export interface GroupCallStageViewerDialogProps {
  readonly isOpen: boolean;
  readonly stageTile: GroupCallStageTile | null;
  readonly stageEyebrowLabel: string;
  readonly fullscreenToggleLabel: string;
  readonly enterFullscreenLabel?: string;
  readonly exitFullscreenLabel?: string;
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
  enterFullscreenLabel = fullscreenToggleLabel,
  exitFullscreenLabel = fullscreenToggleLabel,
  canStopWatchingStageTile,
  stopWatchingStageLabel,
  onClose,
  onStopWatchingStageTile,
}: GroupCallStageViewerDialogProps) {
  if (!isOpen || !stageTile?.hasVideo) {
    return null;
  }
  const stopWatchingIcon = stageTile.videoSource === "screen" ? <ScreenShareIcon /> : <CameraIcon />;

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
        closeLabel={fullscreenToggleLabel}
        stopWatchingLabel={canStopWatchingStageTile ? stopWatchingStageLabel : undefined}
        stopWatchingIcon={stopWatchingIcon}
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
