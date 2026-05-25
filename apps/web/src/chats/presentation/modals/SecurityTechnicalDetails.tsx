import { formatFingerprint } from "@/lib/safety";
import styles from "./SecurityTechnicalDetails.module.css";
import {
  formatDeviceLabel,
  type SecurityModalLogicState,
  type SecurityTranslate,
} from "./security-modal-shared";

interface PeerDeviceSelectorProps {
  readonly effectivePeerDeviceId?: string | null;
  readonly includeEmptyOption?: boolean;
  readonly peerDeviceEntries: SecurityModalLogicState["peerDeviceEntries"];
  readonly selectId: string;
  readonly setSelectedPeerDeviceId: (deviceId: string | null) => void;
  readonly t: SecurityTranslate;
}

interface LocalFingerprintSectionProps {
  readonly myDeviceId: string | null;
  readonly myKeyB64: string | null;
  readonly t: SecurityTranslate;
}

interface PeerFingerprintSectionProps {
  readonly effectivePeerDeviceId?: string | null;
  readonly effectivePeerIdentityKey?: string;
  readonly peerDeviceEntries: SecurityModalLogicState["peerDeviceEntries"];
  readonly recipientUsername: string;
  readonly requiresExplicitPeerDeviceSelection: boolean;
  readonly setSelectedPeerDeviceId: (deviceId: string | null) => void;
  readonly t: SecurityTranslate;
}

export function SecurityTechnicalDetails({
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

function PeerDeviceSelector({
  effectivePeerDeviceId,
  includeEmptyOption = false,
  peerDeviceEntries,
  selectId,
  setSelectedPeerDeviceId,
  t,
}: PeerDeviceSelectorProps) {
  return (
    <div className={styles.deviceSelector}>
      <label htmlFor={selectId} className={styles.deviceHint}>
        {t("security.peerDevice")}
      </label>
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
}: LocalFingerprintSectionProps) {
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
}: PeerFingerprintSectionProps) {
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
      {peerDeviceEntries.length > 1 ? (
        <PeerDeviceSelector
          effectivePeerDeviceId={effectivePeerDeviceId}
          peerDeviceEntries={peerDeviceEntries}
          selectId="peer-device-select"
          setSelectedPeerDeviceId={setSelectedPeerDeviceId}
          t={t}
        />
      ) : null}
      {peerDeviceEntries.length <= 1 && effectivePeerDeviceId ? (
        <div className={styles.deviceHint}>
          {t("security.peerDeviceValue", { device: formatDeviceLabel(effectivePeerDeviceId) })}
        </div>
      ) : null}
    </div>
  );
}
