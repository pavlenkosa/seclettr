import type { PeerIdentityAlert } from "@/stores/messages";
import styles from "./SecurityModal.module.css";
import type { SecurityModalLogicState, SecurityTranslate } from "./security-modal-shared";

export function SafetyNumberSection({
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
      <p className={styles.safetyHint}>{t("security.verificationCodeHint")}</p>
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
        <p className={styles.advancedHint}>{t("security.fullSafetyHint")}</p>
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
