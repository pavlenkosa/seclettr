import { InfoStack, SurfacePanel } from "@/components/ui";
import styles from "../SettingsScreen.module.css";

interface SettingsAccountSummaryProps {
  readonly username?: string | null;
  readonly eyebrow: string;
  readonly appliedInstantlyLabel: string;
}

export function SettingsAccountSummary({
  username,
  eyebrow,
  appliedInstantlyLabel,
}: Readonly<SettingsAccountSummaryProps>) {
  return (
    <SurfacePanel className={styles.accountPanel} tone="strong" padding="md" radius="lg">
      <div className={styles.accountRow}>
        <span className={styles.accountAvatar} aria-hidden="true">{getInitials(username)}</span>
        <InfoStack
          className={styles.accountInfo}
          eyebrow={eyebrow}
          title={username || eyebrow}
          meta={appliedInstantlyLabel}
          metaClassName={styles.accountAppliedNote}
        />
      </div>
    </SurfacePanel>
  );
}

function getInitials(username?: string | null): string {
  const value = username?.trim();
  if (!value) return "S";
  return value.slice(0, 2).toUpperCase();
}
