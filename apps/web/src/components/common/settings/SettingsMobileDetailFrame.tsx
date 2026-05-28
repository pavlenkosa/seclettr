import type { ReactNode } from "react";
import styles from "../SettingsScreen.module.css";

interface SettingsMobileDetailFrameProps {
  readonly title: string;
  readonly description: string;
  readonly children: ReactNode;
}

export function SettingsMobileDetailFrame({
  title,
  description,
  children,
}: Readonly<SettingsMobileDetailFrameProps>) {
  return (
    <main className={styles.detailPane} aria-label={title}>
      <div className={styles.detailHeader}>
        <div className={styles.detailHeading}>
          <h2 className={styles.detailTitle}>{title}</h2>
          <p className={styles.detailDescription}>{description}</p>
        </div>
      </div>
      <div className={styles.detailContent}>{children}</div>
    </main>
  );
}
