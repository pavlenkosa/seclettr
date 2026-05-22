import type { DirectCallMediaEncryptionMode } from "@/calls/direct/model/call-media-encryption-negotiation";
import { CallSecurityCard } from "./CallSecurityCard";
import styles from "@/calls/direct/presentation/DirectCallPanel.module.css";

interface DirectCallSecurityPanelProps {
  readonly onToggle: () => void;
  readonly callSecurityToggleLabel: string;
  readonly callSecurityStatusLabel: string;
  readonly e2eeActive: boolean;
  readonly mediaEncryptionMode: DirectCallMediaEncryptionMode;
  readonly verificationCode: string | null;
  readonly verificationHash: string | null;
  readonly verificationError: string | null;
}

export function DirectCallSecurityPanel({
  onToggle,
  callSecurityToggleLabel,
  callSecurityStatusLabel,
  e2eeActive,
  mediaEncryptionMode,
  verificationCode,
  verificationHash,
  verificationError,
}: DirectCallSecurityPanelProps) {
  return (
    <div className={styles.securitySheetCard}>
      <div className={styles.securitySheetHeader}>
        <span className={styles.securitySheetTitle}>{callSecurityStatusLabel}</span>
        <button
          type="button"
          className={styles.securitySheetClose}
          onClick={onToggle}
          aria-label={callSecurityToggleLabel}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <CallSecurityCard
        e2eeActive={e2eeActive}
        mediaEncryptionMode={mediaEncryptionMode}
        verificationCode={verificationCode}
        verificationHash={verificationHash}
        verificationError={verificationError}
      />
    </div>
  );
}
