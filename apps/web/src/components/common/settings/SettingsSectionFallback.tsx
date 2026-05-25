import styles from "../SettingsScreen.module.css";

interface SettingsSectionFallbackProps {
  readonly label: string;
}

export function SettingsSectionFallback({ label }: Readonly<SettingsSectionFallbackProps>) {
  return (
    <div className={styles.sectionSkeletonStack} aria-busy="true" aria-label={label} role="status">
      <div className={styles.skeletonBlock} />
      <div className={styles.skeletonBlock} />
      <div className={styles.skeletonBlock} />
    </div>
  );
}
