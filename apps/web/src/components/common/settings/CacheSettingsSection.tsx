import { useCallback, useEffect, useRef, useState } from "react";
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
import { SettingsGroup } from "./SettingsSectionPrimitives";
import styles from "./CacheSettingsSection.module.css";
import sharedStyles from "../SettingsSections.module.css";

type ClearMode = "idle" | "confirm" | "busy" | "done";

function SkeletonLine({ width }: { readonly width: string }) {
  return <span className={styles.skeleton} style={{ width }} aria-hidden="true" />;
}

function StorageBarFill({ usedBytes, totalBytes }: { readonly usedBytes: number; readonly totalBytes: number }) {
  const pct = totalBytes > 0 ? Math.min((usedBytes / totalBytes) * 100, 100) : 0;
  return (
    <div
      className={styles.storageBarTrack}
      role="meter"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className={styles.storageBarFill} style={{ width: `${pct}%` }} />
    </div>
  );
}

function ConvBarFill({ bytes, maxBytes }: { readonly bytes: number; readonly maxBytes: number }) {
  const pct = maxBytes > 0 ? Math.min((bytes / maxBytes) * 100, 100) : 0;
  return (
    <div className={styles.convBarTrack}>
      <div className={styles.convBarFill} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function CacheSettingsSection() {
  const { t } = useI18n();
  const [stats, setStats] = useState<CacheStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [clearMode, setClearMode] = useState<ClearMode>("idle");
  const [clearOldMode, setClearOldMode] = useState<ClearMode>("idle");
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const s = await cacheGetStats();
      if (mountedRef.current) setStats(s);
    } catch {
      // keep stale stats visible
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleClearAll = async () => {
    setClearMode("busy");
    try {
      await cacheClearAll();
      if (!mountedRef.current) return;
      setClearMode("done");
      await refresh();
      setTimeout(() => {
        if (mountedRef.current) setClearMode("idle");
      }, 2000);
    } catch {
      if (mountedRef.current) setClearMode("idle");
    }
  };

  const handleClearOlderThanWeek = async () => {
    setClearOldMode("busy");
    try {
      const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      await cacheClearOlderThan(oneWeekAgo);
      if (!mountedRef.current) return;
      setClearOldMode("done");
      await refresh();
      setTimeout(() => {
        if (mountedRef.current) setClearOldMode("idle");
      }, 2000);
    } catch {
      if (mountedRef.current) setClearOldMode("idle");
    }
  };

  const sortedConvs = stats
    ? [...stats.conversations].sort((a, b) => b.estimatedBytes - a.estimatedBytes)
    : [];
  const maxConvBytes = sortedConvs[0]?.estimatedBytes ?? 1;
  const isEmpty = !loading && stats !== null && stats.conversationCount === 0;

  return (
    <div className={sharedStyles.groupStack}>
      {/* ── Storage overview ─────────────────────────────── */}
      <SettingsGroup
        eyebrow={t("settings.cache.storage")}
        title={t("settings.cache.storage.title")}
      >
        <div className={styles.storageCard}>
          {loading ? (
            <>
              <SkeletonLine width="36%" />
              <div className={styles.storageBarTrack}>
                <div className={styles.skeletonBar} />
              </div>
              <SkeletonLine width="62%" />
            </>
          ) : isEmpty ? (
            <p className={styles.emptyState}>{t("settings.cache.empty")}</p>
          ) : (
            <>
              <div className={styles.totalSize}>{formatCacheSize(stats!.estimatedBytes)}</div>
              <StorageBarFill usedBytes={stats!.estimatedBytes} totalBytes={stats!.estimatedBytes} />
              <div className={styles.statsLine}>
                <span>{stats!.conversationCount} {t("settings.cache.cachedConversations").toLowerCase()}</span>
                <span className={styles.statsDot}>·</span>
                <span>{stats!.totalMessages} {t("settings.cache.cachedMessages").toLowerCase()}</span>
              </div>
            </>
          )}
        </div>
      </SettingsGroup>

      {/* ── Per-conversation breakdown ───────────────────── */}
      {(loading || sortedConvs.length > 0) ? (
        <SettingsGroup
          eyebrow={t("settings.cache.conversations")}
          title={t("settings.cache.conversations.title")}
        >
          {loading ? (
            [0, 1, 2].map((i) => (
              <div key={i} className={styles.convItem}>
                <div className={styles.convItemMeta}>
                  <SkeletonLine width={`${38 + i * 14}%`} />
                </div>
                <div className={styles.convItemRight}>
                  <div className={styles.convBarTrack}>
                    <div className={styles.skeletonBar} />
                  </div>
                  <SkeletonLine width="44px" />
                </div>
              </div>
            ))
          ) : (
            sortedConvs.map((conv: CacheConversationInfo) => (
              <div key={conv.convKey} className={styles.convItem}>
                <div className={styles.convName}>{conv.peerName}</div>
                <div className={styles.convItemRight}>
                  <ConvBarFill bytes={conv.estimatedBytes} maxBytes={maxConvBytes} />
                  <span className={styles.convSize}>{formatCacheSize(conv.estimatedBytes)}</span>
                </div>
              </div>
            ))
          )}
        </SettingsGroup>
      ) : null}

      {/* ── Actions ──────────────────────────────────────── */}
      <SettingsGroup
        eyebrow={t("settings.cache.actions")}
        title={t("settings.cache.actions.title")}
        description={t("settings.cache.actions.description")}
        tone="accent"
      >
        <div className={styles.actionRow}>
          <div className={styles.actionLabel}>
            <span>{t("settings.cache.clearOld")}</span>
            <span className={styles.actionDesc}>{t("settings.cache.clearOld.description")}</span>
          </div>
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
        </div>

        <div className={styles.actionRow}>
          <div className={styles.actionLabel}>
            <span>{t("settings.cache.clearAll")}</span>
            <span className={styles.actionDesc}>{t("settings.cache.clearAll.description")}</span>
          </div>
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
        </div>
      </SettingsGroup>

      <PillButton
        type="button"
        tone="neutral"
        appearance="soft"
        size="sm"
        onClick={() => { void refresh(); }}
        className={styles.refreshButton}
        disabled={loading}
      >
        {loading ? t("app.loading") : t("settings.cache.refresh")}
      </PillButton>
    </div>
  );
}
