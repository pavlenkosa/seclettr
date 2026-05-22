import { useMessagesStore } from "@/stores/messages";
import { useAuthStore } from "@/stores/auth";
import { useI18n } from "@/i18n";
import { LabelPill } from "@/components/ui";
import styles from "./ConnectionBanner.module.css";

/**
 * Displays slim banners at the top of the chat for system-health conditions:
 * - WS reconnecting (transient, disappears when reconnected)
 * - Volatile storage key (persistent, shown until page reload/re-login)
 */
export function ConnectionBanner() {
  const wsConnected = useMessagesStore((s) => s.wsConnected);
  const storageKeyVolatile = useAuthStore((s) => s.storageKeyVolatile);
  const { t } = useI18n();

  if (wsConnected && !storageKeyVolatile) return null;

  return (
    <div className={styles.stack}>
      {storageKeyVolatile && (
        <LabelPill tone="warning" size="md" role="alert">
          {t("chat.storage.volatile")}
        </LabelPill>
      )}
      {!wsConnected && (
        <LabelPill tone="warning" size="md" role="status" aria-live="polite" className={styles.pill}>
          <span className={styles.spinner} aria-hidden="true" />
          {t("chat.connection.reconnecting")}
        </LabelPill>
      )}
    </div>
  );
}
