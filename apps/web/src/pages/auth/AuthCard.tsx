/**
 * AuthCard — branded card shell used by all auth screens (login, registration, recovery).
 *
 * Owns:
 *   - App logo mark + name header with optional action slot (e.g., language picker).
 *   - Structured title / subtitle / body / footer layout within a raised `SurfacePanel`.
 *
 * Does not own form logic, validation, store interactions, or navigation.
 * Pass form controls as `body` and submit/link actions as `footer`.
 */
import type { ReactNode } from "react";
import { SeclettrMark } from "@/components/common/SeclettrMark";
import { SurfacePanel } from "@/components/ui";
import styles from "../AuthPage.module.css";

interface AuthCardProps {
  readonly appName: string;
  readonly actions?: ReactNode;
  readonly title: ReactNode;
  readonly subtitle: ReactNode;
  readonly body: ReactNode;
  readonly footer?: ReactNode;
}

export function AuthCard({
  appName,
  actions,
  title,
  subtitle,
  body,
  footer,
}: Readonly<AuthCardProps>) {
  return (
    <SurfacePanel className={styles.card} tone="strong" padding="lg" radius="xl">
      <div className={styles.cardTop}>
        <div className={styles.logo}>
          <span className={styles.logoMark} aria-hidden="true">
            <SeclettrMark decorative />
          </span>
          <span className={styles.logoName}>{appName}</span>
        </div>
        {actions}
      </div>
      <h1 className={styles.title}>{title}</h1>
      <p className={styles.subtitle}>{subtitle}</p>
      {body}
      {footer}
    </SurfacePanel>
  );
}
