/**
 * AuthErrorNotice — dismissible error banner displayed below the auth form on failure.
 *
 * Owns:
 *   - Rendering a `role="alert"` `InlineNotice` when `message` is non-null.
 *   - Exposing a forwarded `ref` so the parent can programmatically focus the notice
 *     for accessibility (scroll-into-view after a failed submission).
 *   - Optional `detail` secondary line for technical context.
 *
 * Does not own error state, retry logic, or form reset behavior.
 * Renders nothing when `message` is null — safe to mount unconditionally.
 */
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
