import { useState, type CSSProperties } from "react";
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
  /**
   * When provided the avatar shows a photo instead of initials.
   * Falls back to initials if the image fails to load.
   * Accepts any URL the browser can display (blob:, https:, etc.).
   */
  readonly imageUrl?: string;
}

const AVATAR_PALETTE = [
  { bg: "#7c3aed", fg: "#ffffff" },
  { bg: "#2563eb", fg: "#ffffff" },
  { bg: "#0891b2", fg: "#ffffff" },
  { bg: "#059669", fg: "#ffffff" },
  { bg: "#65a30d", fg: "#ffffff" },
  { bg: "#ca8a04", fg: "#111827" },
  { bg: "#ea580c", fg: "#ffffff" },
  { bg: "#dc2626", fg: "#ffffff" },
  { bg: "#db2777", fg: "#ffffff" },
  { bg: "#9333ea", fg: "#ffffff" },
  { bg: "#4f46e5", fg: "#ffffff" },
  { bg: "#0f766e", fg: "#ffffff" },
] as const;

function normalizeAvatarSeed(label: string): string {
  return label
    .trim()
    .replace(/^@/, "")
    .normalize("NFKC")
    .toLocaleLowerCase();
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.codePointAt(index) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function resolveAvatarPalette(label: string) {
  const normalized = normalizeAvatarSeed(label);
  const index = normalized ? hashString(normalized) % AVATAR_PALETTE.length : 0;
  return AVATAR_PALETTE[index] ?? AVATAR_PALETTE[0];
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
 * Shared avatar for lists, headers, and call surfaces.
 *
 * When `imageUrl` is provided it shows the user's photo (falls back to
 * initials if the image fails to load). Without `imageUrl` it renders a
 * stable initials-based fallback derived from `label`.
 */
export function Avatar({
  label,
  initials,
  size,
  fontSize,
  className = "",
  ariaHidden = false,
  imageUrl,
}: AvatarProps) {
  const palette = resolveAvatarPalette(label || initials || "");
  const [imgError, setImgError] = useState(false);

  const style = {
    "--avatar-size": typeof size === "number" ? `${size}px` : size,
    "--avatar-font-size": typeof fontSize === "number" ? `${fontSize}px` : fontSize,
    "--avatar-bg": palette.bg,
    "--avatar-fg": palette.fg,
  } as CSSProperties;

  const showImage = !!imageUrl && !imgError;

  return (
    <span
      className={`${styles.root} ${showImage ? styles.rootPhoto : ""} ${className}`.trim()}
      style={style}
      aria-hidden={ariaHidden}
    >
      {showImage ? (
        <img
          src={imageUrl}
          alt=""
          className={styles.photo}
          onError={() => setImgError(true)}
          aria-hidden
        />
      ) : (
        initials ?? toInitials(label)
      )}
    </span>
  );
}
