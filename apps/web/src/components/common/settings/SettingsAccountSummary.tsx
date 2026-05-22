import { SurfacePanel } from "@/components/ui";
import styles from "../SettingsScreen.module.css";

interface SettingsAccountSummaryProps {
  readonly username?: string | null;
}

export function SettingsAccountSummary({ username }: Readonly<SettingsAccountSummaryProps>) {
  return (
    <SurfacePanel className={styles.accountPanel} tone="strong" padding="md" radius="lg">
      <div className={styles.accountRow}>
        <span className={styles.accountAvatar} aria-hidden="true">{getInitials(username)}</span>
        <div className={styles.accountInfo}>
          <span className={styles.accountHandle}>@{username || "me"}</span>
        </div>
      </div>
    </SurfacePanel>
  );
}

function getInitials(username?: string | null): string {
  const value = username?.trim();
  if (!value) return "S";
  return value.slice(0, 2).toUpperCase();
}
