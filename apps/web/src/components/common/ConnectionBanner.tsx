import { useMessagesStore } from "@/stores/messages";
import { useAuthStore } from "@/stores/auth";
import { useI18n } from "@/i18n";
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
        <div className={styles.bannerWarning} role="alert">
          {t("chat.storage.volatile")}
        </div>
      )}
      {!wsConnected && (
        <div className={styles.banner} role="status" aria-live="polite">
          <span className={styles.dot} aria-hidden="true" />
          {t("chat.connection.reconnecting")}
        </div>
      )}
    </div>
  );
}
