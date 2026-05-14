import { forwardRef } from "react";
import { InlineNotice } from "@/components/ui";
import styles from "../AuthPage.module.css";

interface AuthErrorNoticeProps {
  readonly message: string | null;
  readonly detail?: string | null;
}

export const AuthErrorNotice = forwardRef<HTMLDivElement, AuthErrorNoticeProps>(
  function AuthErrorNotice({ message, detail }: Readonly<AuthErrorNoticeProps>, ref) {
    if (!message) {
      return null;
    }

    return (
      <div ref={ref} tabIndex={-1}>
        <InlineNotice tone="error" size="md" role="alert">
          <p className={styles.errorText}>{message}</p>
          {detail ? <p className={styles.errorDetail}>{detail}</p> : null}
        </InlineNotice>
      </div>
    );
  }
);
