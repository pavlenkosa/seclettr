import type { ReactNode } from "react";
import { GroupCallNotice } from "@/calls/group";
import { Avatar, IconButton, SurfacePanel } from "@/components/ui";
import { SecurityStatusIndicator } from "./security/SecurityStatusIndicator";

import styles from "./ChatThreadChrome.module.css";

type ChatThreadChromeStatusTone = "verified" | "unverified" | "attention";

interface ChatThreadChromeCallNotice {
  callType: "audio" | "video";
  status: "ringing" | "active";
  callerLabel: string;
  participantCount: number;
  onJoin: () => void;
}

export interface ChatThreadChromeProps {
  /** Primary thread label shown in the sticky header. */
  readonly title: string;
  /** Secondary status line such as presence or group member count. */
  readonly subtitle: string;
  /** Compact text displayed inside the security indicator. Pass null to hide. */
  readonly statusLabel: string | null;
  /** Full accessible description for the security indicator. Pass null to hide. */
  readonly statusAriaLabel: string | null;
  /** Visual tone applied to the security indicator. Pass null to hide. */
  readonly statusTone: ChatThreadChromeStatusTone | null;
  /** Optional action opening the matching security details surface. */
  readonly onStatusClick?: (() => void) | null;
  /** Source label used to derive the avatar initials. */
  readonly avatarLabel: string;
  /** Accessible label for the mobile back button. */
  readonly backAriaLabel: string;
  /** Back handler used on mobile layouts. */
  readonly onBack: () => void;
  /** Action buttons rendered on the trailing side of the header. */
  readonly actions: ReactNode;
  /** Optional active group-call notice rendered below the header surface. */
  readonly callNotice?: ChatThreadChromeCallNotice | null;
}

/**
 * Sticky thread chrome composed from a shared surface header and an optional
 * active group-call notice. Routing and store concerns stay outside this component.
 */
export function ChatThreadChrome({
  title,
  subtitle,
  statusLabel,
  statusAriaLabel,
  statusTone,
  onStatusClick,
  avatarLabel,
  backAriaLabel,
  onBack,
  actions,
  callNotice = null,
}: ChatThreadChromeProps) {
  return (
    <div className={styles.root}>
      <SurfacePanel
        as="header"
        className={styles.headerSurface}
        padding="none"
        radius="md"
      >
        <div className={styles.header}>
          <IconButton
            onClick={onBack}
            className={`${styles.iconBtn} ${styles.backBtn}`}
            size={40}
            variant="ghost"
            aria-label={backAriaLabel}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M12.5 15L7.5 10l5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </IconButton>

          <Avatar
            label={avatarLabel}
            size={38}
            fontSize="0.82rem"
            ariaHidden
          />

          <div className={styles.info}>
            <span className={styles.title}>{title}</span>
            <span className={styles.subtitle}>{subtitle}</span>
          </div>

          <div className={styles.actions}>
            {statusLabel !== null && statusTone !== null && statusAriaLabel !== null && (
              <>
                <SecurityStatusIndicator
                  className={styles.statusBadge}
                  tone={statusTone}
                  label={statusLabel}
                  ariaLabel={statusAriaLabel}
                  onClick={onStatusClick ?? undefined}
                />
                <span className={styles.actionsDivider} aria-hidden="true" />
              </>
            )}
            {actions}
          </div>
        </div>
      </SurfacePanel>

      {callNotice ? (
        <GroupCallNotice
          callType={callNotice.callType}
          status={callNotice.status}
          callerLabel={callNotice.callerLabel}
          participantCount={callNotice.participantCount}
          onJoin={callNotice.onJoin}
        />
      ) : null}
    </div>
  );
}
