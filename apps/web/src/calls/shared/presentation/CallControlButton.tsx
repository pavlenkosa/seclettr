import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import styles from "./CallControlButton.module.css";

type CallControlButtonLayout = "inline" | "stacked";
type CallControlButtonTone = "default" | "danger" | "success";

interface CallControlButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  /** Leading icon rendered inside the control button. */
  readonly icon: ReactNode;
  /** Visible label rendered next to or below the icon. */
  readonly label: ReactNode;
  /** Layout recipe for inline toolbars or stacked dock controls. */
  readonly layout?: CallControlButtonLayout;
  /** Visual tone used for neutral, destructive, or success actions. */
  readonly tone?: CallControlButtonTone;
  /** Marks the control as toggled or currently active. */
  readonly active?: boolean;
  /** Hides the label on narrow layouts while keeping the icon visible. */
  readonly collapseLabelOnNarrow?: boolean;
  /** Applies a denser narrow-screen treatment for packed control rows. */
  readonly compactOnNarrow?: boolean;
}

/**
 * Shared call control button used across direct and group call toolbars.
 * It keeps icon-label spacing, state styling, and responsive collapse rules aligned.
 */
export const CallControlButton = forwardRef<HTMLButtonElement, CallControlButtonProps>(function CallControlButton(
  {
    icon,
    label,
    layout = "inline",
    tone = "default",
    active = false,
    collapseLabelOnNarrow = false,
    compactOnNarrow = false,
    className = "",
    type = "button",
    ...props
  },
  ref
) {
  return (
    <button
      {...props}
      ref={ref}
      type={type}
      className={[
        styles.button,
        layout === "stacked" ? styles.stacked : styles.inline,
        active ? styles.active : "",
        tone === "danger" ? styles.danger : "",
        tone === "success" ? styles.success : "",
        collapseLabelOnNarrow ? styles.collapseLabelOnNarrow : "",
        compactOnNarrow ? styles.compactOnNarrow : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span className={styles.icon} aria-hidden="true">
        {icon}
      </span>
      <span className={styles.label}>{label}</span>
    </button>
  );
});
