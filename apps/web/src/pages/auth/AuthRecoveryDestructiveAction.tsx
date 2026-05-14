import type { ReactNode } from "react";
import { PillButton, SurfacePanel } from "@/components/ui";
import styles from "../AuthRecoveryPage.module.css";

interface AuthRecoveryDestructiveActionProps {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly actionLabel: string;
  readonly busyLabel: string;
  readonly disabled: boolean;
  readonly onClick: () => void;
  readonly successNotice?: ReactNode;
}

export function AuthRecoveryDestructiveAction({
  id,
  title,
  body,
  actionLabel,
  busyLabel,
  disabled,
  onClick,
  successNotice,
}: Readonly<AuthRecoveryDestructiveActionProps>) {
  return (
    <SurfacePanel
      as="section"
      className={styles.section}
      tone="default"
      padding="md"
      radius="lg"
      aria-labelledby={id}
    >
      <h2 id={id} className={styles.sectionTitle}>{title}</h2>
      <p className={styles.sectionText}>{body}</p>
      <PillButton
        type="button"
        className={styles.resetButton}
        tone="danger"
        appearance="soft"
        size="md"
        fullWidth
        onClick={onClick}
        disabled={disabled}
      >
        {disabled ? busyLabel : actionLabel}
      </PillButton>
      {successNotice}
    </SurfacePanel>
  );
}
