import { useState } from "react";
import { useI18n } from "@/i18n";
import type { DirectCallMediaEncryptionMode } from "@/calls/direct/model/call-media-encryption-negotiation";

import styles from "./CallSecurityCard.module.css";

const VERIFY_EMOJI = [
  "🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼",
  "🐨","🐯","🦁","🐮","🐷","🐸","🐵","🐔",
  "🐧","🐦","🦆","🦅","🦉","🦇","🐺","🐗",
  "🐴","🦄","🐝","🦋","🐌","🐞","🐢","🐍",
  "🌲","🌵","🌴","🌊","🌋","🌺","🌸","🌻",
  "🔥","💧","⚡","❄️","🌈","☀️","🌙","⭐",
  "🍎","🍋","🍇","🍓","🍑","🥝","🍄","🎄",
  "🚀","✈️","🚂","⛵","🏠","🏰","🎸","🎯",
];

function deriveEmoji(groups: string[]): string[] {
  if (groups.length < 2) return [];
  return [0, 1, 2, 3].map((i) => {
    const n = Math.abs(parseInt(groups[i % groups.length] ?? "0", 10));
    return VERIFY_EMOJI[n % VERIFY_EMOJI.length] ?? "🔒";
  });
}

interface CallSecurityCardProps {
  readonly e2eeActive: boolean;
  readonly mediaEncryptionMode: DirectCallMediaEncryptionMode;
  readonly verificationCode: string | null;
  readonly verificationHash: string | null;
  readonly verificationError: string | null;
}

export function CallSecurityCard({
  e2eeActive,
  mediaEncryptionMode,
  verificationCode,
  verificationHash,
  verificationError,
}: CallSecurityCardProps) {
  const { t } = useI18n();
  const [showDetails, setShowDetails] = useState(false);

  const codeGroups = verificationCode?.split(/\s+/).filter(Boolean) ?? [];
  const emoji = deriveEmoji(codeGroups);
  const hasEmoji = emoji.length === 4;
  const isFrameMode = mediaEncryptionMode === "frame-v1";

  return (
    <div className={styles.card} role="status" aria-live="polite">
      {hasEmoji ? (
        <>
          <div className={styles.emojiRow} aria-label={t("callSecurity.codeLabel")}>
            {emoji.map((em, i) => (
              <span key={i} className={styles.emojiCell} aria-hidden="true">{em}</span>
            ))}
          </div>
          <p className={styles.hint}>{t("callSecurity.hintAction")}</p>
        </>
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

      {showDetails ? (
        <div className={styles.details}>
          <div className={styles.detailRow}>
            <span className={styles.detailKey}>{isFrameMode ? t("callSecurity.mode.frame") : t("callSecurity.mode.transport")}</span>
            <span className={`${styles.detailVal} ${isFrameMode ? styles.detailValAccent : ""}`}>
              E2EE
            </span>
          </div>
          {codeGroups.length > 0 ? (
            <div className={styles.detailRow}>
              <span className={styles.detailKey}>{t("callSecurity.codeLabel")}</span>
              <span className={styles.detailValMono}>{codeGroups.join(" ")}</span>
            </div>
          ) : null}
          {verificationHash ? (
            <div className={styles.detailRow}>
              <span className={styles.detailKey}>Session</span>
              <span className={styles.detailValMono}>{verificationHash.slice(0, 12)}</span>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
