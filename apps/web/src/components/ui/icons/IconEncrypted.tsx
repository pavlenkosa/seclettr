/**
 * IconEncrypted — inline SVG encrypted/shield glyph rendered as a presentational icon.
 */
interface Props {
  readonly size?: number;
  readonly className?: string;
  readonly ariaLabel?: string;
}

export function IconEncrypted({ size = 11, className, ariaLabel }: Props) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-label={ariaLabel}
    >
      <rect x="3" y="7" width="10" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5 7V5a3 3 0 0 1 6 0v2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
