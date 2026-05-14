import { useRef, type CSSProperties } from "react";
import { useI18n } from "@/i18n";
import type { PeerIdentityAlert } from "@/stores/messages";
import { useAnimatedClose, useModalSurfaceA11y } from "@/lib/hooks";
import { ModalShell } from "@/components/ui";
import { useSecurityModalLogic } from "./useSecurityModalLogic";
import {
  SafetyNumberSection,
  SecurityHeaderIcon,
  SecurityNotices,
  SecurityQuickGuide,
  SecurityStatusSummary,
  SecurityTechnicalDetails,
} from "./SecurityModalSections";
import { getVerificationStatus } from "./security-modal-shared";

import styles from "./SecurityModal.module.css";

interface Props {
  readonly recipientUserId: string;
  readonly recipientUsername: string;
  readonly peerIdentityKey?: string;
  readonly peerIdentityDeviceId?: string;
  readonly peerIdentityByDevice?: Record<string, string>;
  readonly peerIdentityAlertsByDevice?: Record<string, PeerIdentityAlert>;
  readonly onClose: () => void;
  readonly onVerificationChanged?: () => void;
  readonly onAcceptPeerIdentityChange?: (deviceId: string) => void | Promise<void>;
}

export function SecurityModal({
  recipientUserId,
  recipientUsername,
  peerIdentityKey,
  peerIdentityDeviceId,
  peerIdentityByDevice,
  peerIdentityAlertsByDevice,
  onClose,
  onVerificationChanged,
  onAcceptPeerIdentityChange,
}: Props) {
  const { t, locale } = useI18n();
  const { isClosing, requestClose } = useAnimatedClose(onClose);
  const modalRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useModalSurfaceA11y({
    containerRef: modalRef,
    initialFocusRef: closeButtonRef,
    onClose: requestClose,
  });

  const {
    codes,
    effectivePeerDeviceId,
    effectivePeerIdentityAlert,
    effectivePeerIdentityKey,
    markVerified,
    myDeviceId,
    myKeyB64,
    peerDeviceEntries,
    requiresExplicitPeerDeviceSelection,
    resetVerification,
    setSelectedPeerDeviceId,
    trustIntegrityState,
    verifiedAt,
  } = useSecurityModalLogic({
    onAcceptPeerIdentityChange,
    onVerificationChanged,
    peerIdentityAlertsByDevice,
    peerIdentityByDevice,
    peerIdentityDeviceId,
    peerIdentityKey,
    recipientUserId,
  });

  const verificationStatus = getVerificationStatus({
    effectivePeerIdentityAlert,
    effectivePeerIdentityKey,
    locale,
    requiresExplicitPeerDeviceSelection,
    t,
    trustIntegrityState,
    verifiedAt,
  });

  return (
    <ModalShell
      ref={modalRef}
      isClosing={isClosing}
      onClose={requestClose}
      ariaLabel={t("security.dialogAria")}
      closeAriaLabel={t("security.closeAria")}
      closeButtonRef={closeButtonRef}
      bodyClassName={styles.body}
      headerStart={<SecurityHeaderIcon />}
      title={t("security.title")}
      style={({
        "--modal-width": "480px",
        "--modal-max-height": "calc(100dvh - 1.8rem)",
        "--modal-max-height-mobile": "min(88dvh, 780px)",
        "--modal-z-index": 200,
        "--modal-overlay-padding": "0.9rem",
      }) as CSSProperties}
    >
      <SecurityStatusSummary
        effectivePeerIdentityAlert={effectivePeerIdentityAlert}
        status={verificationStatus}
        t={t}
        verifiedAt={verifiedAt}
      />

      <SecurityNotices
        effectivePeerIdentityAlert={effectivePeerIdentityAlert}
        recipientUsername={recipientUsername}
        t={t}
        trustIntegrityState={trustIntegrityState}
      />

      <p className={styles.description}>
        {t("security.description", { recipient: recipientUsername })}
      </p>
      <SecurityQuickGuide t={t} />

      <SecurityTechnicalDetails
        effectivePeerDeviceId={effectivePeerDeviceId}
        effectivePeerIdentityKey={effectivePeerIdentityKey}
        myDeviceId={myDeviceId}
        myKeyB64={myKeyB64}
        peerDeviceEntries={peerDeviceEntries}
        recipientUsername={recipientUsername}
        requiresExplicitPeerDeviceSelection={requiresExplicitPeerDeviceSelection}
        setSelectedPeerDeviceId={setSelectedPeerDeviceId}
        t={t}
      />

      <SafetyNumberSection
        codes={codes}
        effectivePeerIdentityAlert={effectivePeerIdentityAlert}
        markVerified={markVerified}
        resetVerification={resetVerification}
        t={t}
        verifiedAt={verifiedAt}
      />
    </ModalShell>
  );
}
