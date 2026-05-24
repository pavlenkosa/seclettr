/**
 * IconChevronRight — inline SVG chevron glyph for disclosure, navigation, and row-trailing affordances.
 *
 * Owns:
 *   - Rendering a presentational right-pointing chevron with configurable size and stroke width.
 *   - Keeping the SVG `aria-hidden` so it stays a purely visual helper.
 *
 * Does not own:
 *   - button or row interaction semantics
 *   - navigation logic
 *   - feature-specific meaning beyond the generic chevron shape
 *
 * Use when: a compact forward/disclosure chevron is needed and should inherit `currentColor`.
 */
interface IconChevronRightProps {
  readonly size?: number;
  readonly strokeWidth?: number;
  readonly className?: string;
}

export function IconChevronRight({ size = 16, strokeWidth = 1.7, className }: Readonly<IconChevronRightProps>) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
