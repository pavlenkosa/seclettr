import { useI18n } from "@/i18n";
import { CallIdentityBlock, PillButton, StatusBadge, SurfacePanel } from "@/components/ui";

import styles from "./GroupCallNotice.module.css";

type CallType = "audio" | "video";
type CallStatus = "ringing" | "active";

interface Props {
  readonly callType: CallType;
  readonly status: CallStatus;
  readonly callerLabel: string;
  readonly participantCount: number;
  readonly onJoin: () => void;
}

function PhoneIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path
        d="M3.75 3h3l1.5 3.75-1.875 1.125c.885 1.77 2.25 3.135 4.02 4.02L11.52 10.5 15.27 12v3c0 .828-.672 1.5-1.5 1.5A12.75 12.75 0 0 1 2.25 4.5C2.25 3.672 2.922 3 3.75 3Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path
        d="M1.5 5.25A1.5 1.5 0 0 1 3 3.75h9a1.5 1.5 0 0 1 1.5 1.5v7.5A1.5 1.5 0 0 1 12 14.25H3A1.5 1.5 0 0 1 1.5 12.75V5.25Z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M13.5 7.125l3-1.875v7.5l-3-1.875V7.125Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function GroupCallNotice({
  callType,
  status,
  callerLabel,
  participantCount,
  onJoin,
}: Props) {
  const { t } = useI18n();
  const isActive = status === "active";

  return (
    <SurfacePanel
      className={styles.notice}
      padding="md"
      radius="xl"
      glass="medium"
      role="status"
      aria-live="polite"
    >
      <CallIdentityBlock
        className={styles.body}
        leading={(
          <span className={styles.iconWrap} aria-hidden="true">
            {callType === "video" ? <CameraIcon /> : <PhoneIcon />}
          </span>
        )}
        title={t("group.call.notice.title")}
        titleAccessory={(
          <StatusBadge
            tone={isActive ? "success" : "warning"}
            size="sm"
            dot
          >
            {isActive ? t("group.call.notice.active") : t("group.call.notice.ringing")}
          </StatusBadge>
        )}
        meta={(
          <>
            <span className={styles.metaItem}>{t("group.call.notice.startedBy", { user: callerLabel })}</span>
            <span aria-hidden="true">/</span>
            <span className={styles.metaItem}>
              {t("group.call.notice.participants", { count: Math.max(1, participantCount) })}
            </span>
          </>
        )}
        titleRowClassName={styles.titleRow}
        titleClassName={styles.title}
        metaClassName={styles.meta}
      />

      <PillButton
        type="button"
        onClick={onJoin}
        className={styles.joinBtn}
        tone="accent"
        appearance="soft"
        size="md"
      >
        {t("group.call.join")}
      </PillButton>
    </SurfacePanel>
  );
}

