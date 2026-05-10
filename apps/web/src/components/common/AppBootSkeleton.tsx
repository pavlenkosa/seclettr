import { useI18n } from "@/i18n";
import { SeclettrMark } from "./SeclettrMark";
import styles from "./AppBootSkeleton.module.css";

/**
 * Boot-time splash. We deliberately don't try to fake the chat layout —
 * a half-rendered sidebar reads as "the app is broken" more often than
 * "the app is loading". Instead: brand mark + name + a thin pulsing
 * progress bar underneath. Honors theme tokens (bg / accent) so light,
 * dark, and any custom accent palette look right out of the box.
 */
export function AppBootSkeleton() {
  const { t } = useI18n();
  return (
    <div
      className={styles.shell}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={t("app.loading")}
    >
      <div className={styles.stack}>
        <span className={styles.mark}>
          <SeclettrMark decorative />
        </span>
        <span className={styles.brand}>Seclettr</span>
        <span className={styles.bar} aria-hidden="true">
          <span className={styles.barFill} />
        </span>
        <span className={styles.hint}>{t("app.loading")}</span>
      </div>
    </div>
  );
}
