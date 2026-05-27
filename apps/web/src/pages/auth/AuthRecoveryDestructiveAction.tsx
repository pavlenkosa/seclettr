/**
 * AuthRecoveryDestructiveAction — step-2 reset-data section with a danger confirmation button.
 *
 * Owns:
 *   - Two rendering modes (card / flat) driven by the `flat` prop — see AuthRecoveryExplanation
 *     for the rationale; both modes share the same button and success-notice slots.
 *   - `flat` prop: plain section div with hairline divider on native Capacitor;
 *     `SurfacePanel` rounded card on web.
 *
 * Does not own reset logic, confirmation dialogs, or error state.
 */
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
  readonly flat?: boolean;
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
  flat = false,
}: Readonly<AuthRecoveryDestructiveActionProps>) {
  const content = (
    <>
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
    </>
  );

  if (flat) {
    return (
      <section className={styles.sectionFlat} aria-labelledby={id}>
        {content}
      </section>
    );
  }

  return (
    <SurfacePanel
      as="section"
      className={styles.section}
      tone="default"
      padding="md"
      radius="lg"
      aria-labelledby={id}
    >
      {content}
    </SurfacePanel>
  );
}
