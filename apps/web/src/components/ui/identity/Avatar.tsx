import type { CSSProperties } from "react";
import styles from "./Avatar.module.css";

export interface AvatarProps {
  /** Source label used to derive fallback initials. */
  readonly label: string;
  /** Explicit initials when they should not be derived from the label. */
  readonly initials?: string;
  /** Avatar size in pixels or any supported CSS unit. */
  readonly size?: number | string;
  /** Initials font size in pixels or any supported CSS unit. */
  readonly fontSize?: number | string;
  readonly className?: string;
  /** Hides the decorative avatar from the accessibility tree. */
  readonly ariaHidden?: boolean;
}

function toInitials(label: string): string {
  const normalized = label.trim().replace(/^@/, "");
  if (!normalized) return "?";
  const words = normalized.split(/[\s._-]+/).filter(Boolean);
  if (words.length >= 2) {
    const first = words[0]?.[0] ?? "";
    const second = words[1]?.[0] ?? "";
    return `${first}${second}`.toUpperCase();
  }
  return normalized.slice(0, 2).toUpperCase();
}

/**
 * Shared initials-based avatar for lists, headers, and call surfaces.
 * It intentionally renders a stable visual fallback instead of loading images.
 */
export function Avatar({
  label,
  initials,
  size,
  fontSize,
  className = "",
  ariaHidden = false,
}: AvatarProps) {
  const style = {
    "--avatar-size": typeof size === "number" ? `${size}px` : size,
    "--avatar-font-size": typeof fontSize === "number" ? `${fontSize}px` : fontSize,
  } as CSSProperties;

  return (
    <span
      className={`${styles.root} ${className}`.trim()}
      style={style}
      aria-hidden={ariaHidden}
    >
      {initials ?? toInitials(label)}
    </span>
  );
}
