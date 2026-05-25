/**
 * IconPlus — inline SVG plus/add glyph rendered as a presentational icon.
 *
 * Owns:
 *   - Rendering a centered cross/plus path with configurable size and stroke width.
 *   - Marking the SVG `aria-hidden` so screen readers skip it.
 *
 * Does not own runtime state, business logic, or domain-specific wiring.
 * Use when: a standalone add/create affordance needs an icon that scales with `currentColor`.
 */
interface IconPlusProps {
  readonly size?: number;
  readonly strokeWidth?: number;
  readonly className?: string;
}

export function IconPlus({
  size = 16,
  strokeWidth = 1.7,
  className,
}: Readonly<IconPlusProps>) {
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
        d="M8 2v12M2 8h12"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
    </svg>
  );
}
