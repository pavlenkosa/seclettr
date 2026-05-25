import { SeclettrMark } from "./SeclettrMark";
import styles from "./AppBootSkeleton.module.css";

export function AppBootSkeleton() {
  return (
    <div className={styles.shell} role="status" aria-busy="true" aria-label="Loading">
      <div className={styles.stack}>
        <span className={styles.mark}>
          <SeclettrMark decorative />
        </span>
        <span className={styles.brand}>Seclettr</span>
        <span className={styles.spinner} aria-hidden="true" />
      </div>
    </div>
  );
}
