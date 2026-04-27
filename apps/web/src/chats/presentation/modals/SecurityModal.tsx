import { useRef, type CSSProperties } from "react";
import { useI18n } from "@/i18n";
import type { PeerIdentityAlert } from "@/stores/messages";
import { useAnimatedClose, useModalSurfaceA11y } from "@/lib/hooks";
import {
  formatFingerprint,
} from "@/lib/safety";
import { ModalShell, StatusBadge } from "@/components/ui";
import { useSecurityModalLogic } from "./useSecurityModalLogic";

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

type SecurityTranslate = ReturnType<typeof useI18n>["t"];
type SecurityModalLogicState = ReturnType<typeof useSecurityModalLogic>;
type StatusBadgeTone = "success" | "warning" | "danger";

function formatDeviceLabel(deviceId: string): string {
  if (deviceId.length <= 14) return deviceId;
  return `${deviceId.slice(0, 8)}...${deviceId.slice(-4)}`;
}

function SecurityHeaderIcon() {
  return (
    <span className={styles.headerIcon} aria-hidden="true">
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path d="M9 1.5L15 4.5V9C15 12.75 9 16.5 9 16.5C9 16.5 3 12.75 3 9V4.5L9 1.5Z" fill="currentColor" opacity="0.2" />
        <path d="M9 1.5L15 4.5V9C15 12.75 9 16.5 9 16.5C9 16.5 3 12.75 3 9V4.5L9 1.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M6.75 9L8.25 10.5L11.25 7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function getVerificationStatus(
  params: {
    readonly effectivePeerIdentityAlert?: PeerIdentityAlert | null;
    readonly effectivePeerIdentityKey?: string;
    readonly locale: string;
    readonly requiresExplicitPeerDeviceSelection: boolean;
    readonly t: SecurityTranslate;
    readonly trustIntegrityState: SecurityModalLogicState["trustIntegrityState"];
    readonly verifiedAt: string | null;
  }
) {
  const {
    effectivePeerIdentityAlert,
    effectivePeerIdentityKey,
    locale,
    requiresExplicitPeerDeviceSelection,
    t,
    trustIntegrityState,
    verifiedAt,
  } = params;
  const verifiedLabel = verifiedAt
    ? t("security.verification.verifiedOn", { date: new Date(verifiedAt).toLocaleString(locale) })
    : t("security.verification.unverified");
  const localTrustLabel = trustIntegrityState.degradedAt && !verifiedAt
    ? t("security.verification.localTrustDegraded")
    : verifiedLabel;
  const identityKeyStatus = effectivePeerIdentityAlert
    ? t("security.verification.reverifyRequired")
    : localTrustLabel;

  if (requiresExplicitPeerDeviceSelection) return t("security.verification.selectPeerDevice");
  if (!effectivePeerIdentityKey) return t("security.verification.keyExchangePending");
  return identityKeyStatus;
}

function getStatusBadgeTone(
  effectivePeerIdentityAlert: PeerIdentityAlert | null | undefined,
  verifiedAt: string | null
): StatusBadgeTone {
  if (effectivePeerIdentityAlert) return "danger";
  return verifiedAt ? "success" : "warning";
}

function SecurityStatusSummary({
  effectivePeerIdentityAlert,
  status,
  t,
  verifiedAt,
}: {
  readonly effectivePeerIdentityAlert?: PeerIdentityAlert | null;
  readonly status: string;
  readonly t: SecurityTranslate;
  readonly verifiedAt: string | null;
}) {
  return (
    <>
      <div className={`${styles.e2eeStatus} ${verifiedAt ? styles.e2eeStatusVerified : styles.e2eeStatusUnverified}`}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M7 1L12 3.5V7C12 10.25 7 13 7 13C7 13 2 10.25 2 7V3.5L7 1Z" fill="currentColor" />
        </svg>
        <span>{verifiedAt ? t("security.status.verified") : t("security.status.unverified")}</span>
      </div>
      <StatusBadge
        className={styles.verificationStatus}
        tone={getStatusBadgeTone(effectivePeerIdentityAlert, verifiedAt)}
        size="md"
      >
        {status}
      </StatusBadge>
    </>
  );
}

function SecurityNotices({
  effectivePeerIdentityAlert,
  recipientUsername,
  t,
  trustIntegrityState,
}: {
  readonly effectivePeerIdentityAlert?: PeerIdentityAlert | null;
  readonly recipientUsername: string;
  readonly t: SecurityTranslate;
  readonly trustIntegrityState: SecurityModalLogicState["trustIntegrityState"];
}) {
  return (
    <>
      {effectivePeerIdentityAlert ? (
        <p className={styles.description}>
          {t("security.identityChangeNotice", { recipient: recipientUsername })}
        </p>
      ) : null}

      {trustIntegrityState.degradedAt ? (
        <p className={styles.description}>
          {t("security.localTrustDegradedNotice")}
        </p>
      ) : null}
    </>
  );
}

function SecurityQuickGuide({ t }: { readonly t: SecurityTranslate }) {
  return (
    <div className={styles.quickGuide}>
      <div className={styles.quickGuideTitle}>{t("security.quickGuide.title")}</div>
      <ol className={styles.quickGuideList}>
        <li>{t("security.quickGuide.step1")}</li>
        <li>{t("security.quickGuide.step2")}</li>
      </ol>
    </div>
  );
}

function PeerDeviceSelector({
  effectivePeerDeviceId,
  includeEmptyOption = false,
  peerDeviceEntries,
  selectId,
  setSelectedPeerDeviceId,
  t,
}: {
  readonly effectivePeerDeviceId?: string | null;
  readonly includeEmptyOption?: boolean;
  readonly peerDeviceEntries: SecurityModalLogicState["peerDeviceEntries"];
  readonly selectId: string;
  readonly setSelectedPeerDeviceId: (deviceId: string | null) => void;
  readonly t: SecurityTranslate;
}) {
  return (
    <div className={styles.deviceSelector}>
      <label htmlFor={selectId} className={styles.deviceHint}>{t("security.peerDevice")}</label>
      <select
        id={selectId}
        value={effectivePeerDeviceId ?? ""}
        onChange={(event) => setSelectedPeerDeviceId(event.currentTarget.value || null)}
        className={styles.deviceSelect}
      >
        {includeEmptyOption ? <option value="">{t("security.selectDevice")}</option> : null}
        {peerDeviceEntries.map(([deviceId]) => (
          <option key={deviceId} value={deviceId}>
            {formatDeviceLabel(deviceId)}
          </option>
        ))}
      </select>
    </div>
  );
}

function LocalFingerprintSection({
  myDeviceId,
  myKeyB64,
  t,
}: {
  readonly myDeviceId: string | null;
  readonly myKeyB64: string | null;
  readonly t: SecurityTranslate;
}) {
  if (!myKeyB64) return null;
  return (
    <div className={styles.fingerprintSection}>
      <div className={styles.fingerprintLabel}>{t("security.yourIdentityFingerprint")}</div>
      <code className={styles.fingerprint}>{formatFingerprint(myKeyB64)}</code>
      {myDeviceId ? (
        <div className={styles.deviceHint}>
          {t("security.yourDevice", { device: formatDeviceLabel(myDeviceId) })}
        </div>
      ) : null}
    </div>
  );
}

function PeerFingerprintSection({
  effectivePeerDeviceId,
  effectivePeerIdentityKey,
  peerDeviceEntries,
  recipientUsername,
  requiresExplicitPeerDeviceSelection,
  setSelectedPeerDeviceId,
  t,
}: {
  readonly effectivePeerDeviceId?: string | null;
  readonly effectivePeerIdentityKey?: string;
  readonly peerDeviceEntries: SecurityModalLogicState["peerDeviceEntries"];
  readonly recipientUsername: string;
  readonly requiresExplicitPeerDeviceSelection: boolean;
  readonly setSelectedPeerDeviceId: (deviceId: string | null) => void;
  readonly t: SecurityTranslate;
}) {
  if (!effectivePeerIdentityKey) {
    return (
      <div className={styles.fingerprintSection}>
        <div className={styles.fingerprintLabel}>
          {t("security.peerIdentityFingerprint", { recipient: recipientUsername })}
        </div>
        <div className={styles.fingerprintPending}>
          {requiresExplicitPeerDeviceSelection
            ? t("security.multipleDevicesHint")
            : t("security.exchangeKeysHint")}
        </div>
        {peerDeviceEntries.length > 1 ? (
          <PeerDeviceSelector
            effectivePeerDeviceId={effectivePeerDeviceId}
            includeEmptyOption
            peerDeviceEntries={peerDeviceEntries}
            selectId="peer-device-select-pending"
            setSelectedPeerDeviceId={setSelectedPeerDeviceId}
            t={t}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className={styles.fingerprintSection}>
      <div className={styles.fingerprintLabel}>
        {t("security.peerIdentityFingerprint", { recipient: recipientUsername })}
      </div>
      <code className={styles.fingerprint}>{formatFingerprint(effectivePeerIdentityKey)}</code>
      {peerDeviceEntries.length > 1 && (
        <PeerDeviceSelector
          effectivePeerDeviceId={effectivePeerDeviceId}
          peerDeviceEntries={peerDeviceEntries}
          selectId="peer-device-select"
          setSelectedPeerDeviceId={setSelectedPeerDeviceId}
          t={t}
        />
      )}
      {peerDeviceEntries.length <= 1 && effectivePeerDeviceId && (
        <div className={styles.deviceHint}>
          {t("security.peerDeviceValue", { device: formatDeviceLabel(effectivePeerDeviceId) })}
        </div>
      )}
    </div>
  );
}

function SecurityTechnicalDetails({
  effectivePeerDeviceId,
  effectivePeerIdentityKey,
  myDeviceId,
  myKeyB64,
  peerDeviceEntries,
  recipientUsername,
  requiresExplicitPeerDeviceSelection,
  setSelectedPeerDeviceId,
  t,
}: {
  readonly effectivePeerDeviceId?: string | null;
  readonly effectivePeerIdentityKey?: string;
  readonly myDeviceId: string | null;
  readonly myKeyB64: string | null;
  readonly peerDeviceEntries: SecurityModalLogicState["peerDeviceEntries"];
  readonly recipientUsername: string;
  readonly requiresExplicitPeerDeviceSelection: boolean;
  readonly setSelectedPeerDeviceId: (deviceId: string | null) => void;
  readonly t: SecurityTranslate;
}) {
  return (
    <details
      className={styles.technicalDetails}
      open={requiresExplicitPeerDeviceSelection || !effectivePeerIdentityKey}
    >
      <summary className={styles.technicalSummary}>{t("security.technicalDetails")}</summary>
      <p className={styles.technicalHint}>{t("security.technicalDetailsHint")}</p>
      <LocalFingerprintSection myDeviceId={myDeviceId} myKeyB64={myKeyB64} t={t} />
      <PeerFingerprintSection
        effectivePeerDeviceId={effectivePeerDeviceId}
        effectivePeerIdentityKey={effectivePeerIdentityKey}
        peerDeviceEntries={peerDeviceEntries}
        recipientUsername={recipientUsername}
        requiresExplicitPeerDeviceSelection={requiresExplicitPeerDeviceSelection}
        setSelectedPeerDeviceId={setSelectedPeerDeviceId}
        t={t}
      />
    </details>
  );
}

function SafetyNumberSection({
  codes,
  effectivePeerIdentityAlert,
  markVerified,
  resetVerification,
  t,
  verifiedAt,
}: {
  readonly codes: SecurityModalLogicState["codes"];
  readonly effectivePeerIdentityAlert?: PeerIdentityAlert | null;
  readonly markVerified: () => Promise<void>;
  readonly resetVerification: () => Promise<void>;
  readonly t: SecurityTranslate;
  readonly verifiedAt: string | null;
}) {
  if (!codes) return null;
  const fullSafetyNumberGroups = codes.fullCode.split(/\s+/).filter(Boolean);
  return (
    <div className={styles.safetyNumberSection}>
      <div className={styles.fingerprintLabel}>{t("security.verificationCode")}</div>
      <p className={styles.safetyHint}>
        {t("security.verificationCodeHint")}
      </p>
      <code className={styles.shortCode}>{codes.shortCode}</code>
      <div className={styles.actions}>
        {verifiedAt ? (
          <button type="button" className={styles.secondaryBtn} onClick={() => resetVerification()}>
            {t("security.resetVerification")}
          </button>
        ) : (
          <button type="button" className={styles.primaryBtn} onClick={() => markVerified()}>
            {effectivePeerIdentityAlert
              ? t("security.markVerifiedNewIdentity")
              : t("security.markVerified")}
          </button>
        )}
      </div>
      <details className={styles.advanced}>
        <summary className={styles.advancedSummary}>{t("security.showFullSafetyNumber")}</summary>
        <p className={styles.advancedHint}>
          {t("security.fullSafetyHint")}
        </p>
        <div className={styles.safetyGrid} aria-label={t("security.fullSafetyAria")}>
          {fullSafetyNumberGroups.map((group, index) => (
            <span key={`${group}-${index}`} className={styles.safetyCell}>
              {group}
            </span>
          ))}
        </div>
      </details>
    </div>
  );
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
