import type { CSSProperties, PointerEventHandler, RefObject } from "react";
import { AvatarSummaryButton, FloatingDock, IconButton } from "@/components/ui";

import { CameraIcon, ExpandIcon, HangupIcon, PhoneIcon } from "@/calls/shared/presentation/CallIcons";
import styles from "@/calls/direct/presentation/DirectCallPanel.module.css";

interface DirectCallIncomingMinimizedProps {
  readonly minimizedDockRef: RefObject<HTMLDialogElement>;
  readonly isDraggingMinimizedDock: boolean;
  readonly style?: CSSProperties;
  readonly incomingDialogAriaLabel: string;
  readonly dragAriaLabel: string;
  readonly onStartDrag: PointerEventHandler<HTMLButtonElement>;
  readonly onMoveDrag: PointerEventHandler<HTMLButtonElement>;
  readonly onStopDrag: PointerEventHandler<HTMLButtonElement>;
  readonly incomingMinimizedSummaryRef: RefObject<HTMLButtonElement>;
  readonly incomingMinimizedAcceptButtonRef: RefObject<HTMLButtonElement>;
  readonly incomingCallType: "audio" | "video";
  readonly incomingPeerInitials: string;
  readonly incomingPeerDisplayName: string;
  readonly incomingMetaText: string;
  readonly openDetailsAriaLabel: string;
  readonly rejectAriaLabel: string;
  readonly acceptAriaLabel: string;
  readonly expandAriaLabel: string;
  readonly onOpenDetails: () => void;
  readonly onReject: () => void;
  readonly onAccept: () => void | Promise<void>;
}

export function DirectCallIncomingMinimized({
  minimizedDockRef,
  isDraggingMinimizedDock,
  style,
  incomingDialogAriaLabel,
  dragAriaLabel,
  onStartDrag,
  onMoveDrag,
  onStopDrag,
  incomingMinimizedSummaryRef,
  incomingMinimizedAcceptButtonRef,
  incomingCallType,
  incomingPeerInitials,
  incomingPeerDisplayName,
  incomingMetaText,
  openDetailsAriaLabel,
  rejectAriaLabel,
  acceptAriaLabel,
  expandAriaLabel,
  onOpenDetails,
  onReject,
  onAccept,
}: DirectCallIncomingMinimizedProps) {
  const isVideoCall = incomingCallType === "video";
  return (
    <FloatingDock
      ref={minimizedDockRef}
      className={styles.minimizedCall}
      style={style}
      tabIndex={-1}
      dialogAriaLabel={incomingDialogAriaLabel}
      dragAriaLabel={dragAriaLabel}
      isDragging={isDraggingMinimizedDock}
      onDragStart={onStartDrag}
      onDragMove={onMoveDrag}
      onDragEnd={onStopDrag}
      summary={(
        <AvatarSummaryButton
          ref={incomingMinimizedSummaryRef}
          onClick={onOpenDetails}
          className={styles.minimizedSummary}
          avatarLabel={incomingPeerDisplayName}
          avatarInitials={incomingPeerInitials}
          primaryText={incomingPeerDisplayName}
          secondaryText={incomingMetaText}
          aria-label={openDetailsAriaLabel}
        />
      )}
      actions={(
        <div className={styles.minimizedActions}>
          <IconButton
            onClick={onReject}
            className={styles.minimizedBtn}
            size={38}
            tone="danger"
            aria-label={rejectAriaLabel}
          >
            <HangupIcon />
          </IconButton>
          <IconButton
            ref={incomingMinimizedAcceptButtonRef}
            onClick={() => onAccept()}
            className={styles.minimizedBtn}
            size={38}
            tone="success"
            aria-label={acceptAriaLabel}
          >
            {isVideoCall ? <CameraIcon /> : <PhoneIcon />}
          </IconButton>
          <IconButton
            onClick={onOpenDetails}
            className={styles.minimizedBtn}
            size={38}
            aria-label={expandAriaLabel}
          >
            <ExpandIcon />
          </IconButton>
        </div>
      )}
    >
    </FloatingDock>
  );
}

