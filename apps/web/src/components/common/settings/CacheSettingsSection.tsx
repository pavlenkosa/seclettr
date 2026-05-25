import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/i18n";
import { PillButton } from "@/components/ui";
import {
  cacheGetStats,
  cacheClearAll,
  cacheClearOlderThan,
  formatCacheSize,
  type CacheConversationInfo,
  type CacheStats,
} from "@/stores/plain/messages/plain-message-cache-db";
import { SettingsGroup, SettingsRow } from "./SettingsSectionPrimitives";
import styles from "./CacheSettingsSection.module.css";
import sharedStyles from "../SettingsSections.module.css";

type ClearMode = "idle" | "confirm" | "busy" | "done";

export function CacheSettingsSection() {
  const { t } = useI18n();
  const [stats, setStats] = useState<CacheStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [clearMode, setClearMode] = useState<ClearMode>("idle");
  const [clearOldMode, setClearOldMode] = useState<ClearMode>("idle");

  const refresh = useCallback(async () => {
    setLoading(true);
    const s = await cacheGetStats();
    setStats(s);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleClearAll = async () => {
    setClearMode("busy");
    await cacheClearAll();
    setClearMode("done");
    await refresh();
    setTimeout(() => setClearMode("idle"), 2000);
  };

  const handleClearOlderThanWeek = async () => {
    setClearOldMode("busy");
    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    await cacheClearOlderThan(oneWeekAgo);
    setClearOldMode("done");
    await refresh();
    setTimeout(() => setClearOldMode("idle"), 2000);
  };

  return (
    <div className={sharedStyles.groupStack}>
      <SettingsGroup
        eyebrow={t("settings.cache.storage")}
        title={t("settings.cache.storage.title")}
        description={t("settings.cache.storage.description")}
      >
        {loading ? (
          <SettingsRow label={t("app.loading")}>
            <span className={styles.statValue}>—</span>
          </SettingsRow>
        ) : stats ? (
          <>
            <SettingsRow label={t("settings.cache.totalSize")}>
              <span className={styles.statValue}>{formatCacheSize(stats.estimatedBytes)}</span>
            </SettingsRow>
            <SettingsRow label={t("settings.cache.cachedConversations")}>
              <span className={styles.statValue}>{stats.conversationCount}</span>
            </SettingsRow>
            <SettingsRow label={t("settings.cache.cachedMessages")}>
              <span className={styles.statValue}>{stats.totalMessages}</span>
            </SettingsRow>
          </>
        ) : (
          <SettingsRow label={t("settings.cache.unavailable")}>
            <span className={styles.statValue}>—</span>
          </SettingsRow>
        )}
      </SettingsGroup>

      {stats && stats.conversations.length > 0 ? (
        <SettingsGroup
          eyebrow={t("settings.cache.conversations")}
          title={t("settings.cache.conversations.title")}
        >
          {stats.conversations.map((conv: CacheConversationInfo) => (
            <SettingsRow key={conv.convKey} label={conv.peerName}>
              <span className={styles.statValue}>
                {conv.messageCount} msg · {formatCacheSize(conv.estimatedBytes)}
              </span>
            </SettingsRow>
          ))}
        </SettingsGroup>
      ) : null}

      <SettingsGroup
        eyebrow={t("settings.cache.actions")}
        title={t("settings.cache.actions.title")}
        description={t("settings.cache.actions.description")}
        tone="accent"
      >
        <SettingsRow
          label={t("settings.cache.clearOld")}
          description={t("settings.cache.clearOld.description")}
        >
          <PillButton
            type="button"
            tone="danger"
            appearance="soft"
            size="sm"
            onClick={() => { void handleClearOlderThanWeek(); }}
            disabled={clearOldMode === "busy" || clearOldMode === "done"}
          >
            {clearOldMode === "busy"
              ? t("app.clearing")
              : clearOldMode === "done"
                ? t("app.done")
                : t("settings.cache.clearOld.button")}
          </PillButton>
        </SettingsRow>

        <SettingsRow
          label={t("settings.cache.clearAll")}
          description={t("settings.cache.clearAll.description")}
        >
          {clearMode === "confirm" ? (
            <div className={styles.confirmRow}>
              <PillButton
                type="button"
                tone="danger"
                appearance="strong"
                size="sm"
                onClick={() => { void handleClearAll(); }}
              >
                {t("settings.cache.clearAll.confirm")}
              </PillButton>
              <PillButton
                type="button"
                tone="neutral"
                appearance="soft"
                size="sm"
                onClick={() => setClearMode("idle")}
              >
                {t("settings.appLock.pinEntry.cancel")}
              </PillButton>
            </div>
          ) : (
            <PillButton
              type="button"
              tone="danger"
              appearance="soft"
              size="sm"
              onClick={() => setClearMode("confirm")}
              disabled={clearMode === "busy" || clearMode === "done"}
            >
              {clearMode === "busy"
                ? t("app.clearing")
                : clearMode === "done"
                  ? t("app.done")
                  : t("settings.cache.clearAll.button")}
            </PillButton>
          )}
        </SettingsRow>
      </SettingsGroup>

      <PillButton
        type="button"
        tone="neutral"
        appearance="soft"
        size="sm"
        onClick={() => { void refresh(); }}
        className={styles.refreshButton}
      >
        {t("settings.cache.refresh")}
      </PillButton>
    </div>
  );
}
