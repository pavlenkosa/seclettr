import type { CSSProperties, ReactNode } from "react";
import {
  MessageDeliveryStatusIcon,
  type MessageDeliveryStatus,
} from "@/components/ui";
import styles from "../../UIKitPage.module.css";

export function SectionHeader({
  eyebrow,
  title,
  meta = null,
}: Readonly<{
  eyebrow: string;
  title: string;
  meta?: ReactNode;
}>) {
  return (
    <div className={styles.sectionHeading}>
      <div>
        <span className={styles.sectionEyebrow}>{eyebrow}</span>
        <h2 className={styles.sectionTitle}>{title}</h2>
      </div>
      {meta}
    </div>
  );
}

export function MetricCard({ value, label }: Readonly<{ value: string; label: string }>) {
  return (
    <div className={styles.metricCard}>
      <span className={styles.metricValue}>{value}</span>
      <span className={styles.metricLabel}>{label}</span>
    </div>
  );
}

export function ThemeSnapshotCard({
  label,
  bgVar,
  surfaceVar,
  textVar,
  accentVar,
  bgValue,
  surfaceValue,
  textValue,
  accentValue,
}: Readonly<{
  label: string;
  bgVar: string;
  surfaceVar: string;
  textVar: string;
  accentVar: string;
  bgValue: string;
  surfaceValue: string;
  textValue: string;
  accentValue: string;
}>) {
  return (
    <div
      className={styles.themeCard}
      style={{
        "--theme-bg": bgValue,
        "--theme-surface": surfaceValue,
        "--theme-text": textValue,
        "--theme-accent": accentValue,
      } as CSSProperties}
    >
      <div className={styles.themeCardTop}>
        <strong>{label}</strong>
        <span>{`var(${accentVar})`}</span>
      </div>
      <div className={styles.themeSwatches}>
        <span className={styles.themeSwatch} data-swatch="bg" />
        <span className={styles.themeSwatch} data-swatch="surface" />
        <span className={styles.themeSwatch} data-swatch="accent" />
      </div>
      <code className={styles.themeCode}>
        {`bg: var(${bgVar}) · surface: var(${surfaceVar}) · text: var(${textVar})`}
      </code>
    </div>
  );
}

export function DeliveryStatusItem({
  label,
  status,
}: Readonly<{
  label: string;
  status: MessageDeliveryStatus;
}>) {
  return (
    <span className={styles.deliveryChip}>
      <MessageDeliveryStatusIcon status={status} size={14} />
      <span>{label}</span>
    </span>
  );
}

export function RecipeItem({
  title,
  body,
}: Readonly<{
  title: string;
  body: string;
}>) {
  return (
    <div className={styles.recipeItem}>
      <strong>{title}</strong>
      <p>{body}</p>
    </div>
  );
}
