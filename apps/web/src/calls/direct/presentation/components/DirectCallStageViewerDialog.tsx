import { CallStageViewerDialog } from "@/calls/shared/presentation/CallStageViewerDialog";

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
  readonly onClose: () => void;
  readonly onStopWatchingScreen: () => void;
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
  return (
    <CallStageViewerDialog
      isOpen={isOpen}
      stream={stream}
      title={peerDisplayName}
      eyebrow={screenStageLabel}
      dialogAriaLabel={dialogAriaLabel}
      enterFullscreenLabel={enterFullscreenLabel}
      exitFullscreenLabel={exitFullscreenLabel}
      closeLabel={closeViewerLabel}
      stopWatchingLabel={stopWatchingScreenLabel}
      onClose={onClose}
      onStopWatching={onStopWatchingScreen}
    />
  );
}
