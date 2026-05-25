/**
 * CallStageViewerDialog — fullscreen-capable overlay dialog for watching a shared screen or stage stream.
 *
 * Owns:
 *   - Portal-mounted `<dialog>` with aria-modal and focus trap (via `useCallDialogFocusTrap`)
 *   - Video element bound to the incoming `stream` via `useMediaElementBinding`
 *   - Native browser fullscreen toggle (desktop only, guarded by API availability)
 *   - Top bar with eyebrow/title metadata, expand, optional stop-watching, and close actions
 *   - Empty-state label when no stream is present
 *
 * Does not own stream acquisition, screen-share signalling, call state, or call lifecycle.
 * The caller supplies `stream`, `isOpen`, and all action callbacks.
 * Consumed by both direct and group call stage viewer surfaces.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useMediaElementBinding } from "@/calls/shared/media/useMediaElementBinding";
import { CloseIcon, ExpandIcon, ScreenShareIcon } from "@/calls/shared/presentation/CallIcons";
import { useCallDialogFocusTrap } from "@/calls/shared/presentation/useCallDialogFocusTrap";
import { IconButton } from "@/components/ui";
import { useIsMobileViewport } from "@/lib/hooks";

import styles from "./CallStageViewerDialog.module.css";

export interface CallStageViewerDialogProps {
  readonly isOpen: boolean;
  readonly stream: MediaStream | null;
  readonly title: string;
  readonly eyebrow: string;
  readonly emptyLabel?: string;
  readonly dialogAriaLabel: string;
  readonly enterFullscreenLabel: string;
  readonly exitFullscreenLabel: string;
  readonly closeLabel: string;
  readonly stopWatchingLabel?: string;
  readonly stopWatchingIcon?: ReactNode;
  readonly onClose: () => void;
  readonly onStopWatching?: () => void;
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
        styles.video,
        isReady ? "" : styles.videoHidden,
      ].join(" ").trim()}
      autoPlay
      playsInline
      muted
    />
  );
}

export function CallStageViewerDialog({
  isOpen,
  stream,
  title,
  eyebrow,
  emptyLabel = eyebrow,
  dialogAriaLabel,
  enterFullscreenLabel,
  exitFullscreenLabel,
  closeLabel,
  stopWatchingLabel,
  stopWatchingIcon = <ScreenShareIcon />,
  onClose,
  onStopWatching,
}: CallStageViewerDialogProps) {
  const containerRef = useRef<HTMLDialogElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const [isNativeFullscreen, setIsNativeFullscreen] = useState(false);
  const isMobileViewport = useIsMobileViewport();
  const canUseDocumentFullscreen = typeof document !== "undefined";
  const canToggleNativeFullscreen = Boolean(
    !isMobileViewport &&
    canUseDocumentFullscreen &&
    typeof document.documentElement.requestFullscreen === "function"
  );

  useEffect(() => {
    if (!canUseDocumentFullscreen) return;

    const handleChange = () => {
      setIsNativeFullscreen(document.fullscreenElement != null);
    };
    document.addEventListener("fullscreenchange", handleChange);
    return () => document.removeEventListener("fullscreenchange", handleChange);
  }, [canUseDocumentFullscreen]);

  const exitNativeFullscreen = useCallback(async () => {
    if (!canUseDocumentFullscreen || document.fullscreenElement == null) {
      return;
    }
    await document.exitFullscreen().catch(() => null);
  }, [canUseDocumentFullscreen]);

  const handleToggleNativeFullscreen = useCallback(async () => {
    if (!canToggleNativeFullscreen) {
      return;
    }
    if (document.fullscreenElement == null) {
      await document.documentElement.requestFullscreen().catch(() => null);
    } else {
      await document.exitFullscreen().catch(() => null);
    }
  }, [canToggleNativeFullscreen]);

  const handleClose = useCallback(() => {
    void exitNativeFullscreen().finally(onClose);
  }, [exitNativeFullscreen, onClose]);

  const handleStopWatching = useCallback(() => {
    void exitNativeFullscreen().finally(() => {
      onStopWatching?.();
      onClose();
    });
  }, [exitNativeFullscreen, onClose, onStopWatching]);

  useCallDialogFocusTrap({
    isOpen,
    containerRef,
    initialFocusRef: closeButtonRef,
    onClose: handleClose,
    closeOnEscape: true,
    trapTab: true,
  });

  if (!isOpen || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <dialog
      ref={containerRef}
      open
      className={styles.overlay}
      aria-modal="true"
      aria-label={dialogAriaLabel}
      data-call-nested-dialog="true"
    >
      <StageViewerVideo stream={stream} />
      {stream ? null : (
        <div className={styles.empty}>{emptyLabel}</div>
      )}

      <div className={styles.topBar}>
        <div className={styles.meta}>
          <span className={styles.eyebrow}>{eyebrow}</span>
          <span className={styles.title}>{title}</span>
        </div>
        <div className={styles.actions}>
          {canToggleNativeFullscreen ? (
            <IconButton
              onClick={() => handleToggleNativeFullscreen()}
              className={styles.actionButton}
              size={36}
              aria-label={isNativeFullscreen ? exitFullscreenLabel : enterFullscreenLabel}
              title={isNativeFullscreen ? exitFullscreenLabel : enterFullscreenLabel}
            >
              <ExpandIcon />
            </IconButton>
          ) : null}
          {onStopWatching && stopWatchingLabel ? (
            <IconButton
              onClick={handleStopWatching}
              className={styles.actionButton}
              size={36}
              aria-label={stopWatchingLabel}
              title={stopWatchingLabel}
            >
              {stopWatchingIcon}
            </IconButton>
          ) : null}
          <IconButton
            ref={closeButtonRef}
            onClick={handleClose}
            className={styles.actionButton}
            size={36}
            aria-label={closeLabel}
            title={closeLabel}
          >
            <CloseIcon />
          </IconButton>
        </div>
      </div>
    </dialog>,
    document.body
  );
}
