import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Avatar } from "./Avatar";
import styles from "./AvatarSummaryButton.module.css";

export interface AvatarSummaryButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  /** Source label used for avatar initials when no explicit initials are provided. */
  readonly avatarLabel: string;
  /** Explicit initials rendered inside the avatar bubble. */
  readonly avatarInitials?: string;
  /** Primary line of text. */
  readonly primaryText: ReactNode;
  /** Secondary supporting line rendered under the title. */
  readonly secondaryText?: ReactNode;
}

/**
 * Shared summary button with an initials avatar and a compact two-line text stack.
 * It is used by floating docks and minimized call surfaces that need a reusable identity summary.
 * Choose it for clickable dock or minimized-surface summaries; prefer CallIdentityBlock or InfoStack when the identity block is presentational rather than button-like.
 */
export const AvatarSummaryButton = forwardRef<HTMLButtonElement, AvatarSummaryButtonProps>(function AvatarSummaryButton(
  {
    avatarLabel,
    avatarInitials,
    primaryText,
    secondaryText,
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
      className={[styles.button, className].filter(Boolean).join(" ")}
    >
      <Avatar
        label={avatarLabel}
        initials={avatarInitials}
        size="var(--avatar-summary-avatar-size, 34px)"
        fontSize="var(--avatar-summary-avatar-font-size, 0.72rem)"
        ariaHidden
      />
      <span className={styles.text}>
        <span className={styles.title}>{primaryText}</span>
        {secondaryText ? <span className={styles.subtitle}>{secondaryText}</span> : null}
      </span>
    </button>
  );
});
