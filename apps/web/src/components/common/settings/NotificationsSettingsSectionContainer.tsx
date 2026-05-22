import { useI18n } from "@/i18n";
import { InlineNotice, type StatusBadgeTone } from "@/components/ui";
import { resolvePushStatusLabel, type UsePushSettingsResult } from "../usePushSettings";
import { useHapticsSettings } from "@/ui-settings";
import { NotificationsSettingsSection } from "./NotificationsSettingsSection";
import styles from "../SettingsSections.module.css";

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
  const { vibrationEnabled, setVibrationEnabled } = useHapticsSettings();

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
        vibrationEnabled={vibrationEnabled}
        onBrowserPushToggle={handleBrowserPushToggle}
        onDeletePushSubscription={handleDeletePushSubscription}
        onPreferenceToggle={handlePreferenceToggle}
        onVibrationToggle={setVibrationEnabled}
      />

      {pushError ? (
        <InlineNotice className={styles.feedbackPanel} tone="error" size="md">
          {pushError}
        </InlineNotice>
      ) : null}
    </>
  );
}
