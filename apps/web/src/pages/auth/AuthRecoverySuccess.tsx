import { InlineNotice } from "@/components/ui";
import styles from "../AuthRecoveryPage.module.css";

interface AuthRecoverySuccessProps {
  readonly visible: boolean;
  readonly message: string;
}

export function AuthRecoverySuccess({ visible, message }: Readonly<AuthRecoverySuccessProps>) {
  if (!visible) {
    return null;
  }

  return (
    <InlineNotice className={styles.successNotice} tone="info" size="md" role="status" aria-live="polite">
      {message}
    </InlineNotice>
  );
}
