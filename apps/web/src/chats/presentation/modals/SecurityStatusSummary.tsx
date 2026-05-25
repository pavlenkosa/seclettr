import type { PeerIdentityAlert } from "@/stores/messages";
import { StatusBadge } from "@/components/ui";
import styles from "./SecurityModal.module.css";
import { getStatusBadgeTone, type SecurityModalLogicState, type SecurityTranslate } from "./security-modal-shared";

export function SecurityStatusSummary({
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
      <div
        className={`${styles.e2eeStatus} ${
          verifiedAt ? styles.e2eeStatusVerified : styles.e2eeStatusUnverified
        }`}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path
            d="M7 1L12 3.5V7C12 10.25 7 13 7 13C7 13 2 10.25 2 7V3.5L7 1Z"
            fill="currentColor"
          />
        </svg>
        <span>
          {verifiedAt ? t("security.status.verified") : t("security.status.unverified")}
        </span>
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

export function SecurityNotices({
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
        <p className={styles.description}>{t("security.localTrustDegradedNotice")}</p>
      ) : null}
    </>
  );
}
