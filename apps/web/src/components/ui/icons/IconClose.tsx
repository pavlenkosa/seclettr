/**
 * IconClose — inline SVG close/dismiss glyph rendered as a presentational icon.
 *
 * Owns:
 *   - Rendering a diagonal cross path with configurable size and stroke width.
 *   - Marking the SVG `aria-hidden` so screen readers skip it.
 *
 * Does not own runtime state, business logic, or domain-specific wiring.
 * Use when: a dismiss or clear affordance needs an icon that scales with `currentColor`.
 */
interface IconCloseProps {
  readonly size?: number;
  readonly strokeWidth?: number;
  readonly className?: string;
}

export function IconClose({
  size = 16,
  strokeWidth = 1.7,
  className,
}: Readonly<IconCloseProps>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M3 3l10 10M13 3L3 13"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
    </svg>
  );
}
