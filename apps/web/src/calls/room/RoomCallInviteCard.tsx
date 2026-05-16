import { useI18n } from "@/i18n";
import { FieldSection, PillButton, SurfacePanel } from "@/components/ui";
import { DetailsIcon } from "@/calls/group/presentation/components/GroupCallIcons";
import styles from "./RoomCallPanel.module.css";

interface RoomCallInviteCardProps {
  readonly inviteUrl: string;
  readonly copied: boolean;
  readonly onCopy: () => void;
}

/**
 * Room-local presentation: host invite link card with copy-to-clipboard action.
 * Receives already-shaped props; clipboard runtime stays in `RoomCallPanel`.
 */
export function RoomCallInviteCard({ inviteUrl, copied, onCopy }: RoomCallInviteCardProps) {
  const { t } = useI18n();
  return (
    <FieldSection className={styles.sideSection} label={t("room.call.invite.label")}>
      <SurfacePanel className={styles.inviteCard} padding="md" radius="lg">
        <div className={styles.inviteText}>
          <span className={styles.inviteTitle}>{t("room.call.invite.title")}</span>
          <span className={styles.inviteHint}>{t("room.call.invite.hint")}</span>
          <code className={styles.inviteUrl} title={inviteUrl}>
            {inviteUrl}
          </code>
        </div>
        <PillButton
          type="button"
          onClick={onCopy}
          tone={copied ? "accent" : "neutral"}
          appearance="soft"
          size="sm"
          aria-label={copied ? t("room.call.invite.copiedAriaLabel") : t("room.call.invite.copyAriaLabel")}
          leading={<DetailsIcon />}
        >
          {copied ? t("room.call.invite.copied") : t("room.call.invite.copy")}
        </PillButton>
      </SurfacePanel>
    </FieldSection>
  );
}
