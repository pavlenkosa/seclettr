import type { ReactNode } from "react";
import { FieldSection, SurfacePanel } from "@/components/ui";
import styles from "../SettingsSections.module.css";

interface SettingsRowProps {
  readonly label: ReactNode;
  readonly description?: ReactNode;
  readonly secondaryDescription?: ReactNode;
  readonly children: ReactNode;
  readonly controlClassName?: string;
  readonly layout?: "inline" | "stacked";
}

interface SettingsGroupProps {
  readonly eyebrow: ReactNode;
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly tone?: "default" | "accent" | "strong";
  readonly children: ReactNode;
}

export function SettingsRow({
  label,
  description,
  secondaryDescription,
  children,
  controlClassName = "",
  layout = "inline",
}: SettingsRowProps) {
  return (
    <div
      className={[
        styles.settingRow,
        layout === "stacked" ? styles.settingRowStacked : "",
      ].filter(Boolean).join(" ")}
    >
      <FieldSection
        label={label}
        description={description}
        secondaryDescription={secondaryDescription}
        className={styles.settingField}
        descriptionClassName={styles.settingFieldDescription}
      >
        {null}
      </FieldSection>
      <div className={[styles.settingControl, controlClassName].filter(Boolean).join(" ")}>
        {children}
      </div>
    </div>
  );
}

export function SettingsGroup({
  eyebrow,
  title,
  description,
  tone = "default",
  children,
}: SettingsGroupProps) {
  return (
    <SurfacePanel
      className={styles.groupPanel}
      padding="md"
      radius="xl"
      tone={tone}
    >
      <div className={styles.groupHeader}>
        <div className={styles.groupEyebrow}>{eyebrow}</div>
        <h3 className={styles.groupTitle}>{title}</h3>
        {description ? <p className={styles.groupDescription}>{description}</p> : null}
      </div>
      <div className={styles.groupBody}>
        {children}
      </div>
    </SurfacePanel>
  );
}

export function BellIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7.5 10.2a4.5 4.5 0 1 1 9 0v2.16c0 .93.27 1.84.78 2.62l.8 1.22a1.2 1.2 0 0 1-1 1.86H6.92a1.2 1.2 0 0 1-1-1.86l.8-1.22c.5-.78.78-1.7.78-2.62V10.2Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M10.1 19.2a2.1 2.1 0 0 0 3.8 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function SparklesIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m12 3 1.55 4.45L18 9l-4.45 1.55L12 15l-1.55-4.45L6 9l4.45-1.55L12 3Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="m18.5 15 .72 2.08 2.08.72-2.08.72-.72 2.08-.72-2.08-2.08-.72 2.08-.72.72-2.08Z" fill="currentColor" />
      <path d="m5.5 14 .53 1.47L7.5 16l-1.47.53L5.5 18l-.53-1.47L3.5 16l1.47-.53L5.5 14Z" fill="currentColor" />
    </svg>
  );
}

export function ShieldIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3.4c2.4 1.3 5 2 7.72 2.15v5.29c0 4.52-2.92 8.53-7.22 9.92-4.3-1.39-7.22-5.4-7.22-9.92V5.55C7.98 5.4 10.6 4.7 13 3.4Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="m9.4 12.2 1.9 1.9 3.7-4.05" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
