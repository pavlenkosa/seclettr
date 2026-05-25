import type { ReactNode } from "react";
import { PillButton } from "@/components/ui";
import styles from "../AuthPage.module.css";

interface AuthFormFooterProps {
  readonly submitLabel: string;
  readonly loadingLabel: string;
  readonly loading: boolean;
  readonly disabled: boolean;
  readonly recoveryLink?: ReactNode;
  readonly modeToggle?: ReactNode;
}

export function AuthFormFooter({
  submitLabel,
  loadingLabel,
  loading,
  disabled,
  recoveryLink,
  modeToggle,
}: Readonly<AuthFormFooterProps>) {
  return (
    <>
      <PillButton
        type="submit"
        disabled={disabled}
        className={styles.submit}
        tone="accent"
        appearance="strong"
        size="md"
        fullWidth
      >
        {loading ? loadingLabel : submitLabel}
      </PillButton>
      {recoveryLink ? <div className={styles.helpRow}>{recoveryLink}</div> : null}
      {modeToggle ? <div className={styles.toggle}>{modeToggle}</div> : null}
    </>
  );
}
