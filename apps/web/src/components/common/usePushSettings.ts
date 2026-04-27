import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/i18n";
import { ApiError, api, type PushPreferencesDto, type PushSubscriptionDto } from "@/lib/api";
import {
  disablePushForBrowser,
  enablePushForBrowser,
  getPushClientStatus,
  type PushClientStatus,
} from "@/lib/push";

const DEFAULT_PUSH_PREFERENCES: PushPreferencesDto = {
  directMessagesEnabled: true,
  groupMessagesEnabled: true,
  callInvitesEnabled: true,
  showSender: true,
};

export interface UsePushSettingsResult {
  pushStatus: PushClientStatus | null;
  pushPreferences: PushPreferencesDto;
  pushSubscriptions: PushSubscriptionDto[];
  pushBusy: boolean;
  pushError: string | null;
  handleBrowserPushToggle: (nextValue: string) => Promise<void>;
  handleDeletePushSubscription: (subscriptionId: string) => Promise<void>;
  handlePreferenceToggle: <K extends keyof PushPreferencesDto>(key: K, nextValue: string) => Promise<void>;
}

export function resolvePushStatusLabel(
  pushStatus: PushClientStatus | null,
  t: (key: string) => string
): string {
  if (!pushStatus) return t("settings.push.status.loading");
  if (pushStatus.platformHint === "ios-install-app") return t("settings.push.status.iosInstallApp");
  if (!pushStatus.supported) return t("settings.push.status.unsupported");
  if (!pushStatus.pushConfigured) return t("settings.push.status.unavailable");
  if (pushStatus.permission === "denied") return t("settings.push.status.denied");
  if (pushStatus.subscribed) return t("settings.push.status.ready");
  if (pushStatus.permission === "granted") return t("settings.push.status.granted");
  return t("settings.push.status.prompt");
}

export function resolveNotificationsSummaryTone(pushStatus: PushClientStatus | null): "success" | "danger" | "warning" | "neutral" {
  if (pushStatus?.subscribed) return "success";
  if (pushStatus?.permission === "denied") return "danger";
  if (pushStatus?.supported && pushStatus?.pushConfigured) return "warning";
  return "neutral";
}

/**
 * Manages push notification state and async operations for the Settings modal.
 */
export function usePushSettings(): UsePushSettingsResult {
  const { t } = useI18n();
  const [pushStatus, setPushStatus] = useState<PushClientStatus | null>(null);
  const [pushPreferences, setPushPreferences] = useState<PushPreferencesDto>(DEFAULT_PUSH_PREFERENCES);
  const [pushSubscriptions, setPushSubscriptions] = useState<PushSubscriptionDto[]>([]);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const pushPreferencesRef = useRef<PushPreferencesDto>(DEFAULT_PUSH_PREFERENCES);
  const preferenceRequestIdRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [status, preferences, subscriptions] = await Promise.all([
          getPushClientStatus(),
          api.getPushPreferences().catch(() => DEFAULT_PUSH_PREFERENCES),
          api.listPushSubscriptions().catch(() => []),
        ]);
        if (cancelled) return;
        setPushStatus(status);
        setPushPreferences(preferences);
        pushPreferencesRef.current = preferences;
        setPushSubscriptions(subscriptions);
      } catch {
        if (cancelled) return;
        setPushError(t("settings.push.error.loadFailed"));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [t]);

  const refreshPushStatus = useCallback(async (): Promise<void> => {
    const nextStatus = await getPushClientStatus();
    setPushStatus(nextStatus);
  }, []);

  const refreshPushSubscriptions = useCallback(async (): Promise<void> => {
    const nextSubscriptions = await api.listPushSubscriptions().catch(() => []);
    setPushSubscriptions(nextSubscriptions);
  }, []);

  const handleBrowserPushToggle = useCallback(async (nextValue: string): Promise<void> => {
    setPushBusy(true);
    setPushError(null);
    try {
      if (nextValue === "on") {
        await enablePushForBrowser();
      } else {
        await disablePushForBrowser();
      }
      await refreshPushStatus();
      await refreshPushSubscriptions();
    } catch {
      setPushError(t("settings.push.error.browserToggleFailed"));
    } finally {
      setPushBusy(false);
    }
  }, [t, refreshPushStatus, refreshPushSubscriptions]);

  const handleDeletePushSubscription = useCallback(async (subscriptionId: string): Promise<void> => {
    setPushBusy(true);
    setPushError(null);
    try {
      await api.deletePushSubscription(subscriptionId);
      await refreshPushStatus();
      await refreshPushSubscriptions();
    } catch (error) {
      setPushError(
        error instanceof ApiError
          ? error.message
          : t("settings.push.error.subscriptionDeleteFailed")
      );
    } finally {
      setPushBusy(false);
    }
  }, [t, refreshPushStatus, refreshPushSubscriptions]);

  const handlePreferenceToggle = useCallback(async <K extends keyof PushPreferencesDto>(
    key: K,
    nextValue: string
  ): Promise<void> => {
    const previousPreferences = pushPreferencesRef.current;
    const nextPreferences = { ...previousPreferences, [key]: nextValue === "on" };
    const requestId = preferenceRequestIdRef.current + 1;
    preferenceRequestIdRef.current = requestId;
    setPushBusy(true);
    setPushError(null);
    pushPreferencesRef.current = nextPreferences;
    setPushPreferences(nextPreferences);
    try {
      const saved = await api.updatePushPreferences(nextPreferences);
      if (preferenceRequestIdRef.current !== requestId) {
        return;
      }
      pushPreferencesRef.current = saved;
      setPushPreferences(saved);
    } catch (error) {
      if (preferenceRequestIdRef.current !== requestId) {
        return;
      }
      pushPreferencesRef.current = previousPreferences;
      setPushPreferences(previousPreferences);
      setPushError(
        error instanceof ApiError
          ? error.message
          : t("settings.push.error.preferencesFailed")
      );
    } finally {
      if (preferenceRequestIdRef.current === requestId) {
        setPushBusy(false);
      }
    }
  }, [t]);

  return {
    pushStatus,
    pushPreferences,
    pushSubscriptions,
    pushBusy,
    pushError,
    handleBrowserPushToggle,
    handleDeletePushSubscription,
    handlePreferenceToggle,
  };
}
