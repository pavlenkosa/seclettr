/**
 * IconSearch — inline SVG magnifier/search glyph rendered as a presentational icon.
 *
 * Owns:
 *   - Rendering a circle + diagonal line search path with configurable size.
 *   - Marking the SVG `aria-hidden` so screen readers skip it.
 *
 * Does not own runtime state, business logic, or domain-specific wiring.
 * Use when: a search or find affordance needs an icon that scales with `currentColor`.
 */
interface IconSearchProps {
  readonly size?: number;
  readonly strokeWidth?: number;
  readonly className?: string;
}

export function IconSearch({
  size = 16,
  strokeWidth = 1.5,
  className,
}: Readonly<IconSearchProps>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth={strokeWidth} />
      <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
    </svg>
  );
}
