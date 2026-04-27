import { useState } from "react";
import { useI18n } from "@/i18n";
import type { DirectCallMediaEncryptionMode } from "@/calls/direct/model/call-media-encryption-negotiation";

import styles from "./CallSecurityCard.module.css";

interface CallSecurityCardProps {
  readonly e2eeActive: boolean;
  readonly mediaEncryptionMode: DirectCallMediaEncryptionMode;
  readonly verificationCode: string | null;
  readonly verificationHash: string | null;
  readonly verificationError: string | null;
  readonly transportInfoLabel?: string | null;
}

export function CallSecurityCard({
  e2eeActive,
  mediaEncryptionMode,
  verificationCode,
  verificationHash,
  verificationError,
  transportInfoLabel = null,
}: CallSecurityCardProps) {
  const { t } = useI18n();
  const [showDetails, setShowDetails] = useState(false);

  const codeGroups = verificationCode?.split(/\s+/).filter(Boolean) ?? [];
  const isFrameMode = mediaEncryptionMode === "frame-v1";
  const hasCode = codeGroups.length > 0;

  const statusTone = e2eeActive ? "verified" : "pending";

  return (
    <div
      className={[styles.card, styles[`card--${statusTone}`]].join(" ")}
      role="status"
      aria-live="polite"
    >
      {transportInfoLabel ? (
        <div className={styles.modeNotice}>
          <span className={styles.modeNoticeLabel}>
            {isFrameMode ? t("callSecurity.mode.frame") : t("callSecurity.mode.transport")}
          </span>
          <span className={styles.modeNoticeText}>{transportInfoLabel}</span>
        </div>
      ) : null}

      {hasCode ? (
        <div className={styles.codeSection}>
          <span className={styles.codeLabel}>{t("callSecurity.codeLabel")}</span>
          <div className={styles.codeGrid}>
            {codeGroups.map((group, i) => (
              <span key={`${group}-${i}`} className={styles.codeCell}>{group}</span>
            ))}
          </div>
          <span className={styles.codeHint}>{t("callSecurity.hintAction")}</span>
        </div>
      ) : (
        <div className={styles.waitingRow}>
          <span className={styles.waitingDot} aria-hidden="true" />
          <span className={styles.waitingText}>
            {verificationError ?? (e2eeActive ? t("callSecurity.waitingCode") : t("callSecurity.pendingSubtitle"))}
          </span>
        </div>
      )}

      <button
        type="button"
        className={styles.detailsToggle}
        onClick={() => setShowDetails((s) => !s)}
        aria-expanded={showDetails}
      >
        <span>{t("callSecurity.detailsToggle")}</span>
        <svg
          width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true"
          className={showDetails ? styles.chevronUp : ""}
        >
          <path d="M2 4l3 3 3-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {showDetails && (
        <div className={styles.details}>
          <div className={styles.detailRow}>
            <span className={styles.detailKey}>{t("callSecurity.modeLabel", { mode: "" }).replace(": ", "")}</span>
            <span className={`${styles.detailVal} ${isFrameMode ? styles.detailValAccent : ""}`}>
              {isFrameMode ? t("callSecurity.mode.frame") : t("callSecurity.mode.transport")}
            </span>
          </div>
          {verificationHash && (
            <div className={styles.detailRow}>
              <span className={styles.detailKey}>Session</span>
              <span className={styles.detailValMono}>{verificationHash.slice(0, 12)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
