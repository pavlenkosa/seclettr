import { AvatarSummaryButton } from "@/components/ui";
import styles from "../SettingsScreen.module.css";

interface SettingsAccountSummaryProps {
  readonly username?: string | null;
  /** Invoked when the user taps/clicks the summary — use to navigate to the profile section. */
  readonly onClick?: () => void;
}

export function SettingsAccountSummary({ username, onClick }: Readonly<SettingsAccountSummaryProps>) {
  return (
    <AvatarSummaryButton
      className={styles.accountSummary}
      avatarLabel={username || "me"}
      primaryText={`@${username || "me"}`}
      onClick={onClick}
      type="button"
    />
  );
}
