import { useI18n } from "@/i18n";
import { CallDurationText } from "@/calls/shared/presentation/CallDurationText";
import { HeaderBar, IconButton, IconPill, InfoStack, PillButton, StatusBadge, type StatusBadgeTone } from "@/components/ui";

import {
  CameraIcon,
  DetailsIcon,
  MinimizeIcon,
  PhoneIcon,
} from "./GroupCallIcons";
import styles from "@/calls/group/presentation/GroupCallPanel.module.css";

interface GroupCallHeaderProps {
  readonly groupName: string;
  readonly memberCount: number;
  readonly title: string;
  readonly callDurationSeconds: number;
  readonly callDurationStartedAtMs: number | null;
  readonly hasVisibleVideo: boolean;
  readonly hasRemoteScreenShare: boolean;
  readonly heroStatusLabel: string;
  readonly heroStatusTone: StatusBadgeTone;
  readonly detailsLabel: string;
  readonly detailsToggleLabel: string;
  readonly isDetailsOpen: boolean;
  readonly onToggleDetails: () => void;
  readonly onMinimize: () => void;
}

export function GroupCallHeader({
  groupName,
  memberCount,
  title,
  callDurationSeconds,
  callDurationStartedAtMs,
  hasVisibleVideo,
  hasRemoteScreenShare,
  heroStatusLabel,
  heroStatusTone,
  detailsLabel,
  detailsToggleLabel,
  isDetailsOpen,
  onToggleDetails,
  onMinimize,
}: GroupCallHeaderProps) {
  const { t } = useI18n();

  return (
    <HeaderBar
      className={styles.header}
      stackCenterOnNarrow
      leading={(
        <IconPill
          className={styles.modeChip}
          icon={hasVisibleVideo ? <CameraIcon /> : <PhoneIcon />}
        >
          {hasRemoteScreenShare ? t("group.call.stage.screen") : title}
        </IconPill>
      )}
      center={(
        <InfoStack
          className={styles.headerSummary}
          align="center"
          title={groupName}
          titleAccessory={(
            <CallDurationText
              className={styles.headerDuration}
              baseSeconds={callDurationSeconds}
              startedAtMs={callDurationStartedAtMs}
            />
          )}
          meta={t("group.header.memberCount", { count: memberCount })}
          metaAccessory={(
            <StatusBadge tone={heroStatusTone} size="md" dot className={styles.statusBadge}>
              {heroStatusLabel}
            </StatusBadge>
          )}
          titleClassName={styles.headerTitle}
          metaClassName={styles.headerMetaText}
        />
      )}
      trailing={(
        <div className={styles.headerActions}>
          <PillButton
            type="button"
            onClick={onToggleDetails}
            className={styles.detailsToggleBtn}
            tone={isDetailsOpen ? "accent" : "neutral"}
            appearance="soft"
            size="sm"
            aria-pressed={isDetailsOpen}
            aria-label={detailsToggleLabel}
            data-call-details-toggle="true"
            leading={<DetailsIcon />}
          >
            <span>{detailsLabel}</span>
          </PillButton>
          <IconButton
            onClick={onMinimize}
            className={styles.iconBtn}
            size={38}
            variant="glass"
            aria-label={t("group.call.minimize")}
          >
            <MinimizeIcon />
          </IconButton>
        </div>
      )}
    />
  );
}
