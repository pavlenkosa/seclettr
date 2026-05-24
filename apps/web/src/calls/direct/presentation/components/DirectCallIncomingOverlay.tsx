import type { RefObject } from "react";
import { CallControlButton } from "@/calls/shared/presentation/CallControlButton";
import { CameraIcon, HangupIcon, MinimizeIcon, PhoneIcon } from "@/calls/shared/presentation/CallIcons";
import { Avatar, HeaderBar, IconButton, IconPill, InfoStack } from "@/components/ui";

import panelStyles from "@/calls/direct/presentation/DirectCallPanel.module.css";
import styles from "./DirectCallIncomingOverlay.module.css";

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
      className={`${panelStyles.callOverlay} ${styles.incomingOverlay}`}
      role="alertdialog"
      aria-modal="true"
      aria-label={incomingDialogAriaLabel}
      tabIndex={-1}
    >
      <HeaderBar
        className={panelStyles.callHeader}
        stackCenterOnNarrow
        leading={(
          <IconPill
            className={panelStyles.modeChip}
            icon={isVideoCall ? <CameraIcon /> : <PhoneIcon />}
            size="sm"
          >
            {isVideoCall ? videoCallLabel : voiceCallLabel}
          </IconPill>
        )}
        trailing={(
          <IconButton
            onClick={onMinimize}
            className={panelStyles.minimizeBtn}
            size={34}
            aria-label={minimizeAriaLabel}
          >
            <MinimizeIcon />
          </IconButton>
        )}
      />

      <div className={`${panelStyles.callCenter} ${styles.incomingCenter}`}>
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
        <InfoStack
          className={styles.incomingInfo}
          align="center"
          title={incomingPeerDisplayName}
          meta={ringingLabel}
          titleClassName={styles.incomingName}
          metaClassName={styles.incomingRingLabel}
        />
      </div>

      <div className={`${panelStyles.controlsDock} ${styles.incomingControlsDock}`}>
        <CallControlButton
          onClick={onReject}
          className={panelStyles.controlBtn}
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
          className={panelStyles.controlBtn}
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
