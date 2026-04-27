import { useI18n } from "@/i18n";
import { SurfacePanel, type StatusBadgeTone } from "@/components/ui";
import { resolvePushStatusLabel, type UsePushSettingsResult } from "../usePushSettings";
import { NotificationsSettingsSection } from "./NotificationsSettingsSection";
import styles from "../SettingsModal.module.css";

export interface NotificationsSectionMeta {
  summary: string;
  summaryTone: StatusBadgeTone;
}

export function NotificationsSettingsSectionContainer({
  pushStatus,
  pushPreferences,
  pushSubscriptions,
  pushBusy,
  pushError,
  handleBrowserPushToggle,
  handleDeletePushSubscription,
  handlePreferenceToggle,
}: Readonly<UsePushSettingsResult>) {
  const { t } = useI18n();

  const pushStatusLabel = resolvePushStatusLabel(pushStatus, t);
  const browserPushValue = pushStatus?.browserEnabled && pushStatus.subscribed ? "on" : "off";
  const browserPushDisabled = pushBusy || !pushStatus?.supported || !pushStatus?.pushConfigured;

  return (
    <>
      <NotificationsSettingsSection
        pushStatusLabel={pushStatusLabel}
        browserPushValue={browserPushValue}
        browserPushDisabled={browserPushDisabled}
        pushPreferences={pushPreferences}
        pushSubscriptions={pushSubscriptions}
        pushBusy={pushBusy}
        onBrowserPushToggle={handleBrowserPushToggle}
        onDeletePushSubscription={handleDeletePushSubscription}
        onPreferenceToggle={handlePreferenceToggle}
      />

      {pushError ? (
        <SurfacePanel
          className={styles.feedbackPanel}
          tone="strong"
          padding="md"
          radius="lg"
          glass="medium"
        >
          <p className={styles.error}>{pushError}</p>
        </SurfacePanel>
      ) : null}
    </>
  );
}
