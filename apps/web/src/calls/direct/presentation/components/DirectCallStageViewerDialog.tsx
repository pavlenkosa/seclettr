import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMediaElementBinding } from "@/calls/shared/media/useMediaElementBinding";
import { ExpandIcon, ScreenShareIcon } from "@/calls/shared/presentation/CallIcons";
import { useCallDialogFocusTrap } from "@/calls/shared/presentation/useCallDialogFocusTrap";
import { IconButton } from "@/components/ui";
import { useIsMobileViewport } from "@/lib/hooks";

import styles from "@/calls/direct/presentation/DirectCallPanel.module.css";

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

function StageViewerVideo({ stream }: { readonly stream: MediaStream | null }) {
  const { elementRef, isReady } = useMediaElementBinding<HTMLVideoElement>({
    kind: "video",
    stream,
    muted: true,
  });

  return (
    <video
      ref={elementRef}
      className={[
        styles.stageViewerVideo,
        isReady ? "" : styles.stageViewerVideoHidden,
      ].join(" ").trim()}
      autoPlay
      playsInline
      muted
    />
  );
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
  const containerRef = useRef<HTMLDialogElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const [isNativeFullscreen, setIsNativeFullscreen] = useState(false);
  const isMobileViewport = useIsMobileViewport();
  const canToggleNativeFullscreen = !isMobileViewport && typeof document.documentElement.requestFullscreen === "function";

  // Track native fullscreen state changes.
  // We request fullscreen on document.documentElement (not the dialog div) because
  // CSS transforms on ancestor elements (present in the call panel) block requestFullscreen()
  // on descendants. The dialog is already position:fixed covering the viewport.
  useEffect(() => {
    const handleChange = () => {
      setIsNativeFullscreen(document.fullscreenElement != null);
    };
    document.addEventListener("fullscreenchange", handleChange);
    return () => document.removeEventListener("fullscreenchange", handleChange);
  }, []);

  const exitNativeFullscreen = useCallback(async () => {
    if (document.fullscreenElement != null) {
      await document.exitFullscreen().catch(() => null);
    }
  }, []);

  const handleToggleNativeFullscreen = useCallback(async () => {
    if (!canToggleNativeFullscreen) {
      return;
    }
    if (document.fullscreenElement != null) {
      await document.exitFullscreen().catch(() => null);
    } else if (typeof document.documentElement.requestFullscreen === "function") {
      await document.documentElement.requestFullscreen().catch(() => null);
    }
  }, [canToggleNativeFullscreen]);

  const handleClose = useCallback(() => {
    exitNativeFullscreen().finally(onClose);
  }, [exitNativeFullscreen, onClose]);

  const handleStopWatching = useCallback(() => {
    exitNativeFullscreen().finally(() => {
      onStopWatchingScreen();
      onClose();
    });
  }, [exitNativeFullscreen, onClose, onStopWatchingScreen]);

  useCallDialogFocusTrap({
    isOpen,
    containerRef,
    initialFocusRef: closeButtonRef,
    onClose: handleClose,
    closeOnEscape: true,
    trapTab: true,
  });

  if (!isOpen) {
    return null;
  }

  // Portals to document.body to escape callOverlay's animation transform (scale(1)),
  // which would otherwise create a new fixed-positioning containing block and clip the overlay.
  return createPortal(
    <dialog
      ref={containerRef}
      open
      className={styles.stageViewerOverlay}
      aria-modal="true"
      aria-label={dialogAriaLabel}
      data-call-nested-dialog="true"
    >
      {/* Video fills the entire overlay */}
      <StageViewerVideo stream={stream} />
      {stream ? null : (
        <div className={styles.stageViewerEmpty}>{screenStageLabel}</div>
      )}

      {/* Controls overlaid at top */}
      <div className={styles.stageViewerTopBar}>
        <div className={styles.stageViewerMeta}>
          <span className={styles.stageViewerEyebrow}>{screenStageLabel}</span>
          <span className={styles.stageViewerTitle}>{peerDisplayName}</span>
        </div>
        <div className={styles.stageViewerActions}>
          {canToggleNativeFullscreen ? (
            <IconButton
              onClick={() => handleToggleNativeFullscreen()}
              className={styles.stageActionIconBtn}
              size={36}
              variant="glass"
              aria-label={isNativeFullscreen ? exitFullscreenLabel : enterFullscreenLabel}
              title={isNativeFullscreen ? exitFullscreenLabel : enterFullscreenLabel}
            >
              <ExpandIcon />
            </IconButton>
          ) : null}
          <IconButton
            onClick={handleStopWatching}
            className={styles.stageActionIconBtn}
            size={36}
            variant="glass"
            aria-label={stopWatchingScreenLabel}
            title={stopWatchingScreenLabel}
          >
            <ScreenShareIcon />
          </IconButton>
          <IconButton
            ref={closeButtonRef}
            onClick={handleClose}
            className={styles.stageActionIconBtn}
            size={36}
            variant="glass"
            aria-label={closeViewerLabel}
            title={closeViewerLabel}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M3 3l10 10M13 3 3 13" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
          </IconButton>
        </div>
      </div>
    </dialog>,
    document.body
  );
}
