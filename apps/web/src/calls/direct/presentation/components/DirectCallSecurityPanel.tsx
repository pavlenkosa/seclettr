import type { DirectCallMediaEncryptionMode } from "@/calls/direct/model/call-media-encryption-negotiation";
import { CallSecurityCard } from "./CallSecurityCard";
import { ShieldIcon } from "@/calls/shared/presentation/CallIcons";
import { PillButton, SecurityModeBadge, StatusBadge, SurfacePanel } from "@/components/ui";

import styles from "@/calls/direct/presentation/DirectCallPanel.module.css";

interface DirectCallSecurityPanelProps {
  readonly isOpen: boolean;
  readonly onToggle: () => void;
  readonly callSecurityToggleLabel: string;
  readonly callSecurityStatusLabel: string;
  readonly callMediaEncryptionModeLabel: string;
  readonly e2eeActive: boolean;
  readonly showTransportModeInfo: boolean;
  readonly transportModeInfoLabel: string;
  readonly mediaEncryptionMode: DirectCallMediaEncryptionMode;
  readonly verificationCode: string | null;
  readonly verificationHash: string | null;
  readonly verificationError: string | null;
}

export function DirectCallSecurityPanel({
  isOpen,
  onToggle,
  callSecurityToggleLabel,
  callSecurityStatusLabel,
  callMediaEncryptionModeLabel,
  e2eeActive,
  showTransportModeInfo,
  transportModeInfoLabel,
  mediaEncryptionMode,
  verificationCode,
  verificationHash,
  verificationError,
}: DirectCallSecurityPanelProps) {
  const isFrameMode = mediaEncryptionMode === "frame-v1";

  return (
    <div className={styles.securityPanel}>
      <SurfacePanel
        className={styles.securityPanelShell}
        tone="default"
        padding="md"
        radius="xl"
      >
        <div className={styles.securitySummaryRow}>
          <div className={styles.securityHeaderText}>
            <div className={styles.securityBadgeGroup}>
              <StatusBadge
                tone={e2eeActive ? "success" : "warning"}
                size="md"
                icon={<ShieldIcon />}
                iconSize={12}
              >
                {callSecurityStatusLabel}
              </StatusBadge>
              <SecurityModeBadge tone={isFrameMode ? "frame" : "transport"}>
                {callMediaEncryptionModeLabel}
              </SecurityModeBadge>
            </div>
          </div>
          <PillButton
            className={styles.securityToggleInlineBtn}
            tone={isOpen ? "accent" : "neutral"}
            appearance="soft"
            size="sm"
            aria-expanded={isOpen}
            aria-label={callSecurityToggleLabel}
            onClick={onToggle}
          >
            {callSecurityToggleLabel}
          </PillButton>
        </div>
        {isOpen ? (
          <div className={styles.securityDetailsSlot}>
            <CallSecurityCard
              e2eeActive={e2eeActive}
              mediaEncryptionMode={mediaEncryptionMode}
              verificationCode={verificationCode}
              verificationHash={verificationHash}
              verificationError={verificationError}
              transportInfoLabel={showTransportModeInfo ? transportModeInfoLabel : null}
            />
          </div>
        ) : null}
      </SurfacePanel>
    </div>
  );
}
