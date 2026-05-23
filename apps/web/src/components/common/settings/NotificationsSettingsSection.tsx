import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/i18n";
import type { PushPreferencesDto, PushSubscriptionDto } from "@/lib/api";
import { EntityRow, PillButton, SegmentedControl, StatusBadge } from "@/components/ui";
import { isNativePlatform } from "@/lib/native-platform";
import {
  getNativeNotificationPermission,
  requestNativeNotificationPermission,
} from "@/lib/native-notifications";
import { isVibrationSupported } from "@/lib/native-haptics";
import { SettingsGroup, SettingsRow } from "./SettingsSectionPrimitives";
import styles from "../SettingsSections.module.css";

type NativePermission = "granted" | "denied" | "prompt" | "unsupported" | "loading";

function NativeNotificationsGroup() {
  const { t } = useI18n();
  const [permission, setPermission] = useState<NativePermission>("loading");
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    void getNativeNotificationPermission().then(setPermission);
  }, []);

  const statusLabel = permission === "loading"
    ? "…"
    : permission === "granted"
      ? t("settings.native.notifications.status.granted")
      : permission === "denied"
        ? t("settings.native.notifications.status.denied")
        : t("settings.native.notifications.status.notRequested");

  const isLoading = permission === "loading";
  const canRequest = !isLoading && permission !== "granted" && permission !== "unsupported";

  async function handleRequest() {
    setRequesting(true);
    const result = await requestNativeNotificationPermission();
    setPermission(result);
    setRequesting(false);
  }

  return (
    <SettingsGroup
      eyebrow={t("settings.groups.notifications.native")}
      title={t("settings.groups.notifications.native.title")}
      description={t("settings.groups.notifications.native.description")}
      tone="accent"
    >
      <SettingsRow
        label={t("settings.native.notifications.permission")}
        description={statusLabel}
      >
        {canRequest ? (
          <PillButton
            type="button"
            tone="accent"
            appearance="soft"
            size="sm"
            disabled={requesting || isLoading}
            onClick={() => void handleRequest()}
          >
            {t("settings.native.notifications.allow")}
          </PillButton>
        ) : null}
      </SettingsRow>
    </SettingsGroup>
  );
}

const TOGGLE_OPTIONS = [
  { value: "on", label: "On" },
  { value: "off", label: "Off" },
] as const;

interface NotificationsSettingsSectionProps {
  readonly pushStatusLabel: string;
  readonly browserPushValue: "on" | "off";
  readonly browserPushDisabled: boolean;
  readonly pushPreferences: PushPreferencesDto;
  readonly pushSubscriptions: PushSubscriptionDto[];
  readonly pushBusy: boolean;
  readonly vibrationEnabled: "on" | "off";
  readonly onBrowserPushToggle: (nextValue: "on" | "off") => Promise<void>;
  readonly onDeletePushSubscription: (subscriptionId: string) => Promise<void>;
  readonly onPreferenceToggle: <K extends keyof PushPreferencesDto>(key: K, nextValue: "on" | "off") => Promise<void>;
  readonly onVibrationToggle: (nextValue: "on" | "off") => void;
}

function formatPushSubscriptionLabel(
  subscription: PushSubscriptionDto,
  currentLabel: string,
  fallbackLabel: string
): string {
  const raw = subscription.userAgent?.trim();
  if (!raw) {
    return subscription.currentDevice ? currentLabel : fallbackLabel;
  }
  return raw.length > 84 ? `${raw.slice(0, 81)}...` : raw;
}

export function NotificationsSettingsSection({
  pushStatusLabel,
  browserPushValue,
  browserPushDisabled,
  pushPreferences,
  pushSubscriptions,
  pushBusy,
  vibrationEnabled,
  onBrowserPushToggle,
  onDeletePushSubscription,
  onPreferenceToggle,
  onVibrationToggle,
}: NotificationsSettingsSectionProps) {
  const { t } = useI18n();

  const browserPushOptions = useMemo(
    () => TOGGLE_OPTIONS.map((option) => ({
      value: option.value,
      label: t(`settings.toggle.${option.value}`),
      disabled: browserPushDisabled,
    })),
    [t, browserPushDisabled]
  );
  const togglePushOptions = useMemo(
    () => TOGGLE_OPTIONS.map((option) => ({
      value: option.value,
      label: t(`settings.toggle.${option.value}`),
      disabled: pushBusy,
    })),
    [t, pushBusy]
  );

  return (
    <div className={styles.groupStack}>
      {isVibrationSupported() ? (
        <SettingsGroup
          eyebrow={t("settings.groups.feedback")}
          title={t("settings.groups.feedback.title")}
          description={t("settings.groups.feedback.description")}
        >
          <SettingsRow
            label={t("settings.haptics.vibration")}
            description={t("settings.haptics.vibration.description")}
          >
            <SegmentedControl
              value={vibrationEnabled}
              onChange={onVibrationToggle}
              ariaLabel={t("settings.haptics.vibration")}
              grouped
              options={togglePushOptions}
            />
          </SettingsRow>
        </SettingsGroup>
      ) : null}

      {isNativePlatform() ? <NativeNotificationsGroup /> : null}

      <SettingsGroup
        eyebrow={t("settings.groups.notifications.browser")}
        title={t("settings.groups.notifications.browser.title")}
        description={t("settings.groups.notifications.browser.description")}
        tone="accent"
      >
        <SettingsRow
          label={t("settings.push.browser")}
          description={t("settings.push.browser.description")}
          secondaryDescription={pushStatusLabel}
        >
          <SegmentedControl
            value={browserPushValue}
            onChange={(nextValue) => {
              void onBrowserPushToggle(nextValue);
            }}
            ariaLabel={t("settings.push.browser")}
            grouped
            options={browserPushOptions}
          />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup
        eyebrow={t("settings.groups.notifications.alerts")}
        title={t("settings.groups.notifications.alerts.title")}
        description={t("settings.groups.notifications.alerts.description")}
      >
        <SettingsRow
          label={t("settings.push.directMessages")}
          description={t("settings.push.directMessages.description")}
        >
          <SegmentedControl
            value={pushPreferences.directMessagesEnabled ? "on" : "off"}
            onChange={(nextValue) => {
              void onPreferenceToggle("directMessagesEnabled", nextValue);
            }}
            ariaLabel={t("settings.push.directMessages")}
            grouped
            options={togglePushOptions}
          />
        </SettingsRow>

        <SettingsRow
          label={t("settings.push.groupMessages")}
          description={t("settings.push.groupMessages.description")}
        >
          <SegmentedControl
            value={pushPreferences.groupMessagesEnabled ? "on" : "off"}
            onChange={(nextValue) => {
              void onPreferenceToggle("groupMessagesEnabled", nextValue);
            }}
            ariaLabel={t("settings.push.groupMessages")}
            grouped
            options={togglePushOptions}
          />
        </SettingsRow>

        <SettingsRow
          label={t("settings.push.callInvites")}
          description={t("settings.push.callInvites.description")}
        >
          <SegmentedControl
            value={pushPreferences.callInvitesEnabled ? "on" : "off"}
            onChange={(nextValue) => {
              void onPreferenceToggle("callInvitesEnabled", nextValue);
            }}
            ariaLabel={t("settings.push.callInvites")}
            grouped
            options={togglePushOptions}
          />
        </SettingsRow>

        <SettingsRow
          label={t("settings.push.showSender")}
          description={t("settings.push.showSender.description")}
        >
          <SegmentedControl
            value={pushPreferences.showSender ? "on" : "off"}
            onChange={(nextValue) => {
              void onPreferenceToggle("showSender", nextValue);
            }}
            ariaLabel={t("settings.push.showSender")}
            grouped
            options={togglePushOptions}
          />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup
        eyebrow={t("settings.groups.notifications.devices")}
        title={t("settings.groups.notifications.devices.title")}
        description={t("settings.groups.notifications.devices.description")}
        tone="strong"
      >
        {pushSubscriptions.length === 0 ? (
          <p className={styles.deviceEmpty}>{t("settings.push.devices.empty")}</p>
        ) : (
          <div className={styles.deviceList}>
            {pushSubscriptions.map((subscription) => {
              let statusLabel: string;
              if (subscription.lastErrorAt) {
                statusLabel = t("settings.push.devices.status.error");
              } else if (subscription.lastSuccessAt) {
                statusLabel = t("settings.push.devices.status.active");
              } else {
                statusLabel = t("settings.push.devices.status.pending");
              }

              return (
                <EntityRow
                  key={subscription.id}
                  as="div"
                  size="md"
                  align="start"
                  className={styles.deviceCard}
                  mainClassName={styles.deviceMeta}
                  titleClassName={styles.deviceTitle}
                  title={formatPushSubscriptionLabel(
                    subscription,
                    t("settings.push.devices.currentBrowser"),
                    t("settings.push.devices.browser")
                  )}
                  subtitle={(
                    <span className={styles.deviceStatusRow}>
                      <span className={styles.deviceStatus}>{statusLabel}</span>
                      {subscription.currentDevice ? (
                        <StatusBadge tone="accent" size="sm">
                          {t("settings.push.devices.current")}
                        </StatusBadge>
                      ) : null}
                    </span>
                  )}
                  trailing={(
                    <PillButton
                      type="button"
                      className={styles.deviceAction}
                      tone="danger"
                      appearance="soft"
                      size="sm"
                      onClick={() => {
                        void onDeletePushSubscription(subscription.id);
                      }}
                      disabled={pushBusy}
                    >
                      {t("settings.push.devices.revoke")}
                    </PillButton>
                  )}
                />
              );
            })}
          </div>
        )}
      </SettingsGroup>
    </div>
  );
}
