import type {
  CSSProperties,
  ReactNode,
  PointerEventHandler,
  RefObject,
} from "react";
import { CallMediaSurface } from "@/calls/shared/presentation/CallMediaSurface";

import styles from "@/calls/direct/presentation/DirectCallPanel.module.css";

export interface DirectCallFloatingPreviewProps {
  readonly shellRef: RefObject<HTMLDivElement>;
  readonly videoRef: RefObject<HTMLVideoElement>;
  readonly label: string;
  readonly className?: string;
  readonly isDragging: boolean;
  readonly isResizing?: boolean;
  readonly style?: CSSProperties;
  readonly onStartDrag: PointerEventHandler<HTMLDivElement>;
  readonly onMoveDrag: PointerEventHandler<HTMLDivElement>;
  readonly onStopDrag: PointerEventHandler<HTMLDivElement>;
  readonly onStartResize?: PointerEventHandler<HTMLButtonElement>;
  readonly onMoveResize?: PointerEventHandler<HTMLButtonElement>;
  readonly onStopResize?: PointerEventHandler<HTMLButtonElement>;
  readonly resizeHandleLabel?: string;
  readonly onSecondaryAction?: () => void;
  readonly secondaryActionLabel?: string;
  readonly secondaryActionContent?: ReactNode;
  readonly secondaryActionDisabled?: boolean;
}

export function DirectCallFloatingPreview({
  shellRef,
  videoRef,
  label,
  className,
  isDragging,
  isResizing = false,
  style,
  onStartDrag,
  onMoveDrag,
  onStopDrag,
  onStartResize,
  onMoveResize,
  onStopResize,
  resizeHandleLabel,
  onSecondaryAction,
  secondaryActionLabel,
  secondaryActionContent,
  secondaryActionDisabled = false,
}: DirectCallFloatingPreviewProps) {
  return (
    <div
      ref={shellRef}
      className={[
        className,
        isDragging ? styles.localPreviewDragging : "",
        isResizing ? styles.localPreviewResizing : "",
      ].filter(Boolean).join(" ")}
      style={style}
      onPointerDown={onStartDrag}
      onPointerMove={onMoveDrag}
      onPointerUp={onStopDrag}
      onPointerCancel={onStopDrag}
    >
      <CallMediaSurface
        className={styles.floatingPreviewSurface}
        media={<video ref={videoRef} autoPlay playsInline muted />}
        overlayBottom={<div className={styles.localMeta}>{label}</div>}
        onSecondaryAction={onSecondaryAction}
        secondaryActionLabel={secondaryActionLabel}
        secondaryActionContent={secondaryActionContent}
        secondaryActionDisabled={secondaryActionDisabled}
        secondaryActionClassName={styles.localPreviewAction}
      >
        {onStartResize && onMoveResize && onStopResize && resizeHandleLabel ? (
          <button
            type="button"
            className={styles.localPreviewResizeHandle}
            aria-label={resizeHandleLabel}
            title={resizeHandleLabel}
            onPointerDown={(event) => {
              event.stopPropagation();
              onStartResize(event);
            }}
            onPointerMove={(event) => {
              event.stopPropagation();
              onMoveResize(event);
            }}
            onPointerUp={(event) => {
              event.stopPropagation();
              onStopResize(event);
            }}
            onPointerCancel={(event) => {
              event.stopPropagation();
              onStopResize(event);
            }}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
              <path d="M2 9L9 2M4.5 9L9 4.5M7 9L9 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>
        ) : null}
      </CallMediaSurface>
    </div>
  );
}
