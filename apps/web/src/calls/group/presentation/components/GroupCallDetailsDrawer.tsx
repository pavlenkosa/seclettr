import { useI18n } from "@/i18n";
import { Avatar, EntityRow, FieldSection, InlineNotice, PillButton, SurfacePanel } from "@/components/ui";

import { AudioOutputSelector } from "@/calls/shared/media/audio-output/AudioOutputSelector";
import { getMemberInitials } from "@/calls/group/presentation/display";
import styles from "@/calls/group/presentation/GroupCallPanel.module.css";

interface GroupCallDetailsMember {
  userId: string;
  username: string;
}

interface GroupCallDetailsDrawerProps {
  readonly isOpen: boolean;
  readonly inline?: boolean;
  readonly roomCode: string;
  readonly statusLabel: string;
  readonly mediaKeyStatusLabel: string;
  readonly mediaKeyModeLabel: string;
  readonly mediaModeDowngraded: boolean;
  readonly effectiveFrameEncryptionEnabled: boolean;
  readonly sharedMediaKeyDeviceCount: number;
  readonly receivedMediaKeyCount: number;
  readonly members: GroupCallDetailsMember[];
  readonly activeParticipantSet: Set<string>;
  readonly error: string | null;
  readonly hostActionLabel?: string;
  readonly hostActionHint?: string;
  readonly onHostAction?: () => void;
}

export function GroupCallDetailsDrawer({
  isOpen,
  inline = false,
  roomCode,
  statusLabel,
  mediaKeyStatusLabel,
  mediaKeyModeLabel,
  mediaModeDowngraded,
  effectiveFrameEncryptionEnabled,
  sharedMediaKeyDeviceCount,
  receivedMediaKeyCount,
  members,
  activeParticipantSet,
  error,
  hostActionLabel,
  hostActionHint,
  onHostAction,
}: GroupCallDetailsDrawerProps) {
  const { t } = useI18n();
  const showHostAction = Boolean(hostActionLabel && onHostAction);

  return (
    <SurfacePanel
      as="aside"
      id="group-call-details"
      className={[
        styles.detailsDrawer,
        isOpen ? styles.detailsDrawerOpen : "",
        inline ? styles.detailsDrawerInline : "",
      ].filter(Boolean).join(" ")}
      tone="strong"
      padding="lg"
      radius="xl"
      aria-hidden={inline ? undefined : !isOpen}
    >
      <FieldSection className={styles.section} label={t("group.call.roomId")}>
        <SurfacePanel className={styles.detailsCard} padding="md">
          <div className={styles.roomIdCode}>{roomCode}</div>
          <div className={styles.roomIdHint}>{statusLabel}</div>
        </SurfacePanel>
      </FieldSection>

      <FieldSection className={styles.section} label={t("group.call.mediaKeySection")}>
        <SurfacePanel className={styles.detailsCard} padding="md">
          <div className={styles.metaPrimary}>{mediaKeyStatusLabel}</div>
          <div className={styles.metaSecondary}>{t("group.call.mediaKeyMode", { mode: mediaKeyModeLabel })}</div>
          {mediaModeDowngraded ? (
            <InlineNotice tone="warning" size="sm" className={styles.metaNotice}>
              {t("group.call.mediaModeDowngraded", { mode: mediaKeyModeLabel })}
            </InlineNotice>
          ) : null}
          {effectiveFrameEncryptionEnabled ? (
            <>
              <div className={styles.metaSecondary}>
                {t("group.call.mediaKeyShared", { count: sharedMediaKeyDeviceCount })}
              </div>
              <div className={styles.metaSecondary}>
                {t("group.call.mediaKeyReceived", { count: receivedMediaKeyCount })}
              </div>
            </>
          ) : null}
        </SurfacePanel>
      </FieldSection>

      <FieldSection className={styles.section} label={t("group.call.members")}>
        <div className={styles.memberList}>
          {members.map((member) => {
            const isActiveParticipant = activeParticipantSet.has(member.userId);
            return (
              <SurfacePanel
                key={member.userId}
                className={`${styles.memberRow} ${isActiveParticipant ? styles.memberRowActive : ""}`}
                padding="none"
              >
                <EntityRow
                  as="div"
                  size="sm"
                  className={styles.memberRowContent}
                  leading={(
                    <Avatar
                      label={member.username}
                      initials={getMemberInitials(member.username)}
                      className={styles.memberAvatar}
                      ariaHidden
                    />
                  )}
                  title={`@${member.username}`}
                  titleClassName={styles.memberName}
                  trailing={(
                    <span
                      className={`${styles.memberPresenceDot} ${isActiveParticipant ? styles.memberPresenceDotActive : ""}`}
                      aria-hidden="true"
                    />
                  )}
                />
              </SurfacePanel>
            );
          })}
        </div>
      </FieldSection>

      <FieldSection className={styles.section} label={t("call.audioOutput.label")}>
        <SurfacePanel className={styles.detailsCard} padding="md">
          <AudioOutputSelector className={styles.audioOutputSelector} />
        </SurfacePanel>
      </FieldSection>

      {error ? (
        <InlineNotice className={styles.errorNotice} tone="error" size="md" role="alert">
          {error}
        </InlineNotice>
      ) : null}

      {showHostAction ? (
        <FieldSection className={styles.section} label={t("group.call.hostActions")}>
          <SurfacePanel className={styles.hostActionCard} padding="md">
            {hostActionHint ? <p className={styles.hostActionHint}>{hostActionHint}</p> : null}
            <PillButton
              type="button"
              tone="danger"
              appearance="soft"
              size="md"
              onClick={onHostAction}
            >
              {hostActionLabel}
            </PillButton>
          </SurfacePanel>
        </FieldSection>
      ) : null}

      <SurfacePanel className={styles.contractHint} padding="sm">
        <p className={styles.contractHintText}>{t("group.call.contractHint")}</p>
      </SurfacePanel>
    </SurfacePanel>
  );
}
