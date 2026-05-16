import { useI18n } from "@/i18n";
import { InlineNotice, PillButton, SurfacePanel } from "@/components/ui";
import styles from "./RoomCallPanel.module.css";

interface RoomCallStateNoticeProps {
  readonly variant: "connecting" | "error";
  readonly errorMessage: string | null;
  readonly onLeave: () => void;
}

/**
 * Room-local presentation: centered connecting / error state surface.
 * Leave runtime stays in `RoomCallPanel`; this only renders the state copy.
 */
export function RoomCallStateNotice({ variant, errorMessage, onLeave }: RoomCallStateNoticeProps) {
  const { t } = useI18n();

  if (variant === "connecting") {
    return (
      <SurfacePanel className={styles.centeredState} padding="lg" radius="xl">
        <p className={styles.mutedText}>{t("group.call.starting")}</p>
      </SurfacePanel>
    );
  }

  return (
    <SurfacePanel className={styles.centeredState} padding="lg" radius="xl">
      <InlineNotice className={styles.errorNotice} tone="error" size="md" role="alert">
        {errorMessage ?? t("room.call.error.connection")}
      </InlineNotice>
      <div className={styles.stateActions}>
        <PillButton type="button" tone="danger" appearance="soft" size="md" onClick={onLeave}>
          {t("group.call.leave")}
        </PillButton>
      </div>
    </SurfacePanel>
  );
}
