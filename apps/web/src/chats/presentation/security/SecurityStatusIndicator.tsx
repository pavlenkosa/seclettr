import type { ReactNode } from "react";
import styles from "./SecurityStatusIndicator.module.css";

export type SecurityStatusIndicatorTone = "verified" | "unverified" | "attention";

interface SecurityStatusIndicatorProps {
  readonly tone: SecurityStatusIndicatorTone;
  readonly label: string;
  readonly ariaLabel: string;
  readonly className?: string;
  readonly onClick?: () => void;
}

function SecurityGlyph({ tone }: { readonly tone: SecurityStatusIndicatorTone }) {
  if (tone === "verified") {
    return (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
        <path
          d="M8 1.75 13 4v3.7c0 3.25-5 5.95-5 5.95S3 10.95 3 7.7V4l5-2.25Z"
          stroke="currentColor"
          strokeWidth="1.45"
          strokeLinejoin="round"
        />
        <path
          d="m5.6 7.85 1.45 1.45 3.35-3.35"
          stroke="currentColor"
          strokeWidth="1.45"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (tone === "attention") {
    return (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
        <path
          d="M8 1.75 13 4v3.7c0 3.25-5 5.95-5 5.95S3 10.95 3 7.7V4l5-2.25Z"
          stroke="currentColor"
          strokeWidth="1.45"
          strokeLinejoin="round"
        />
        <path d="M8 5.2v3.2" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" />
        <path d="M8 10.85h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path
        d="M8 1.75 13 4v3.7c0 3.25-5 5.95-5 5.95S3 10.95 3 7.7V4l5-2.25Z"
        stroke="currentColor"
        strokeWidth="1.45"
        strokeLinejoin="round"
      />
      <path d="M8 5.2v2.8" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" />
      <path d="M8 10.25h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function renderContent(tone: SecurityStatusIndicatorTone, label: string): ReactNode {
  return (
    <>
      <span className={styles.icon} aria-hidden="true">
        <SecurityGlyph tone={tone} />
      </span>
      <span className={styles.label}>{label}</span>
    </>
  );
}

export function SecurityStatusIndicator({
  tone,
  label,
  ariaLabel,
  className = "",
  onClick,
}: SecurityStatusIndicatorProps) {
  const classNames = [
    styles.indicator,
    styles[tone],
    onClick ? styles.button : "",
    className,
  ].filter(Boolean).join(" ");

  if (onClick) {
    return (
      <button
        type="button"
        className={classNames}
        onClick={onClick}
        aria-label={ariaLabel}
        title={ariaLabel}
      >
        {renderContent(tone, label)}
      </button>
    );
  }

  return (
    <span className={classNames} role="status" aria-label={ariaLabel} title={ariaLabel}>
      {renderContent(tone, label)}
    </span>
  );
}
