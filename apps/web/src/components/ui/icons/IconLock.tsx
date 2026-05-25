/**
 * IconLock — inline SVG lock glyph rendered as a presentational icon.
 */
interface Props {
  readonly size?: number;
  readonly strokeWidth?: number;
}

export function IconLock({ size = 16, strokeWidth = 1.6 }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth={strokeWidth} />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
    </svg>
  );
}
