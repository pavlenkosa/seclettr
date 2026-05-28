import { useI18n } from "@/i18n";
import { SeclettrMark } from "./SeclettrMark";
import styles from "./AppBootSkeleton.module.css";

interface Props {
  readonly offline?: boolean;
  readonly onRetry?: () => void;
}

export function AppBootSkeleton({ offline, onRetry }: Props = {}) {
  const { t } = useI18n();
  return (
    <div
      className={styles.shell}
      role="status"
      aria-busy={!offline}
      aria-label={offline ? t("restore.networkError.title") : "Loading"}
    >
      <div className={styles.stack}>
        <span className={styles.mark}>
          <SeclettrMark decorative />
        </span>
        <span className={styles.brand}>Seclettr</span>
        {offline ? (
          <div className={styles.offlineBlock}>
            <p className={styles.offlineMsg}>{t("restore.networkError.title")}</p>
            {onRetry && (
              <button type="button" className={styles.retryBtn} onClick={onRetry}>
                {t("restore.networkError.retry")}
              </button>
            )}
          </div>
        ) : (
          <span className={styles.spinner} aria-hidden="true" />
        )}
      </div>
    </div>
  );
}
