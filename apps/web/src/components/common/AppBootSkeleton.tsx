import { useI18n } from "@/i18n";
import { SeclettrMark } from "./SeclettrMark";
import styles from "./AppBootSkeleton.module.css";

const SIDEBAR_ROWS = [
  { name: 64, preview: 78 },
  { name: 48, preview: 62 },
  { name: 70, preview: 84 },
  { name: 38, preview: 56 },
  { name: 58, preview: 72 },
  { name: 50, preview: 68 },
  { name: 60, preview: 82 },
];

/**
 * Boot-time placeholder shown while the app is restoring the session,
 * loading initial state, or chunk-loading the chat surface. Mirrors the
 * actual ChatPage chrome (sidebar header, search field, conversation
 * rows, empty-state thread mark) so the transition into the live UI is
 * a fade-into-real-content rather than a content jolt.
 *
 * Skeleton bars use opacity pulses on the existing surface tokens — no
 * accent shimmer — so the screen stays in palette across light/dark
 * themes and any custom accent.
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
      <aside className={styles.sidebar} aria-hidden="true">
        <div className={styles.sidebarHeader}>
          <span className={styles.brandMark}>
            <SeclettrMark decorative />
          </span>
          <span className={styles.brandStack}>
            <span className={`${styles.brandTitle} ${styles.bar}`} />
            <span className={`${styles.brandHandle} ${styles.bar}`} />
          </span>
          <span className={styles.headerActions}>
            <span className={`${styles.headerIcon} ${styles.bar}`} />
            <span className={`${styles.headerIcon} ${styles.bar}`} />
            <span className={`${styles.headerIcon} ${styles.bar}`} />
          </span>
        </div>

        <div className={styles.searchBar}>
          <span className={`${styles.searchIcon} ${styles.bar}`} />
          <span className={`${styles.searchLine} ${styles.bar}`} />
        </div>

        <ul className={styles.sidebarList}>
          {SIDEBAR_ROWS.map((row, idx) => (
            <li key={idx} className={styles.row}>
              <span className={`${styles.avatar} ${styles.bar}`} />
              <span className={styles.rowText}>
                <span className={`${styles.rowName} ${styles.bar}`} style={{ width: `${row.name}%` }} />
                <span className={`${styles.rowPreview} ${styles.bar}`} style={{ width: `${row.preview}%` }} />
              </span>
            </li>
          ))}
        </ul>
      </aside>

      <main className={styles.thread} aria-hidden="true">
        <span className={styles.threadMark}>
          <SeclettrMark decorative />
        </span>
      </main>
    </div>
  );
}
