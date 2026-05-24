import { lazy, Suspense, useCallback } from "react";

const LazyCallStageViewerDialog = lazy(() =>
  import("@/calls/shared/presentation/CallStageViewerDialog").then(({ CallStageViewerDialog }) => ({
    default: CallStageViewerDialog,
  }))
);

interface DirectCallStageViewerDialogProps {
  readonly isOpen: boolean;
  readonly stream: MediaStream | null;
  readonly peerDisplayName: string;
  readonly callStateText: string;
  readonly screenStageLabel: string;
  readonly dialogAriaLabel: string;
  readonly enterFullscreenLabel: string;
  readonly exitFullscreenLabel: string;
  readonly closeViewerLabel: string;
  readonly stopWatchingScreenLabel: string;
  readonly onClose?: () => void;
  readonly onStopWatchingScreen?: () => void;
}

export function DirectCallStageViewerDialog({
  isOpen,
  stream,
  peerDisplayName,
  callStateText: _callStateText,
  screenStageLabel,
  dialogAriaLabel,
  enterFullscreenLabel,
  exitFullscreenLabel,
  closeViewerLabel,
  stopWatchingScreenLabel,
  onClose,
  onStopWatchingScreen,
}: DirectCallStageViewerDialogProps) {
  const handleClose = useCallback(() => {
    onClose?.();
  }, [onClose]);

  const handleStopWatching = useCallback(() => {
    onStopWatchingScreen?.();
  }, [onStopWatchingScreen]);

  if (!isOpen || !stream) {
    return null;
  }

  return (
    <Suspense fallback={null}>
      <LazyCallStageViewerDialog
        isOpen={isOpen}
        stream={stream}
        title={peerDisplayName}
        eyebrow={screenStageLabel}
        dialogAriaLabel={dialogAriaLabel}
        enterFullscreenLabel={enterFullscreenLabel}
        exitFullscreenLabel={exitFullscreenLabel}
        closeLabel={closeViewerLabel}
        stopWatchingLabel={stopWatchingScreenLabel}
        onClose={handleClose}
        onStopWatching={handleStopWatching}
      />
    </Suspense>
  );
}
