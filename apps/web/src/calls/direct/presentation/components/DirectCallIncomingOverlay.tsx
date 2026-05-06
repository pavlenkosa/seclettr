import type { RefObject } from "react";
import { CallControlButton } from "@/calls/shared/presentation/CallControlButton";
import { CameraIcon, HangupIcon, MinimizeIcon, PhoneIcon } from "@/calls/shared/presentation/CallIcons";
import { Avatar, HeaderBar, IconButton, IconPill } from "@/components/ui";

import styles from "@/calls/direct/presentation/DirectCallPanel.module.css";

interface DirectCallIncomingOverlayProps {
  readonly incomingOverlayRef: RefObject<HTMLDivElement>;
  readonly incomingCallType: "audio" | "video";
  readonly incomingPeerInitials: string;
  readonly incomingPeerDisplayName: string;
  readonly ringingLabel: string;
  readonly incomingDialogAriaLabel: string;
  readonly minimizeAriaLabel: string;
  readonly videoCallLabel: string;
  readonly voiceCallLabel: string;
  readonly rejectAriaLabel: string;
  readonly acceptAriaLabel: string;
  readonly onMinimize: () => void;
  readonly onReject: () => void;
  readonly onAccept: () => void | Promise<void>;
  readonly incomingAcceptButtonRef: RefObject<HTMLButtonElement>;
}

export function DirectCallIncomingOverlay({
  incomingOverlayRef,
  incomingCallType,
  incomingPeerInitials,
  incomingPeerDisplayName,
  ringingLabel,
  incomingDialogAriaLabel,
  minimizeAriaLabel,
  videoCallLabel,
  voiceCallLabel,
  rejectAriaLabel,
  acceptAriaLabel,
  onMinimize,
  onReject,
  onAccept,
  incomingAcceptButtonRef,
}: DirectCallIncomingOverlayProps) {
  const isVideoCall = incomingCallType === "video";

  return (
    <div
      ref={incomingOverlayRef}
      className={`${styles.callOverlay} ${styles.incomingOverlay}`}
      role="alertdialog"
      aria-modal="true"
      aria-label={incomingDialogAriaLabel}
      tabIndex={-1}
    >
      <HeaderBar
        className={styles.callHeader}
        stackCenterOnNarrow
        leading={(
          <IconPill
            className={styles.modeChip}
            icon={isVideoCall ? <CameraIcon /> : <PhoneIcon />}
            size="sm"
          >
            {isVideoCall ? videoCallLabel : voiceCallLabel}
          </IconPill>
        )}
        trailing={(
          <IconButton
            onClick={onMinimize}
            className={styles.minimizeBtn}
            size={34}
            aria-label={minimizeAriaLabel}
          >
            <MinimizeIcon />
          </IconButton>
        )}
      />

      <div className={`${styles.callCenter} ${styles.incomingCenter}`}>
        <div className={styles.incomingAvatarShell}>
          <div className={styles.incomingRingA} aria-hidden="true" />
          <div className={styles.incomingRingB} aria-hidden="true" />
          <Avatar
            label={incomingPeerDisplayName}
            initials={incomingPeerInitials}
            className={styles.incomingAvatar}
            ariaHidden
          />
        </div>
        <div className={styles.incomingInfo}>
          <span className={styles.incomingName}>{incomingPeerDisplayName}</span>
          <span className={styles.incomingRingLabel}>{ringingLabel}</span>
        </div>
      </div>

      <div className={`${styles.controlsDock} ${styles.incomingControlsDock}`}>
        <CallControlButton
          onClick={onReject}
          className={styles.controlBtn}
          tone="danger"
          icon={<HangupIcon />}
          label={rejectAriaLabel}
          collapseLabelOnNarrow
          compactOnNarrow
          aria-label={rejectAriaLabel}
        />
        <CallControlButton
          ref={incomingAcceptButtonRef}
          onClick={() => onAccept()}
          className={styles.controlBtn}
          tone="success"
          icon={isVideoCall ? <CameraIcon /> : <PhoneIcon />}
          label={acceptAriaLabel}
          collapseLabelOnNarrow
          compactOnNarrow
          aria-label={acceptAriaLabel}
        />
      </div>
    </div>
  );
}
