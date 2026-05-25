/**
 * IconNewGroup — inline SVG "add group" glyph (two people silhouettes + plus) rendered
 * as a presentational icon.
 *
 * Owns:
 *   - Rendering two overlapping person silhouettes with a plus accent.
 *   - Marking the SVG `aria-hidden` so screen readers skip it.
 *
 * Does not own runtime state, business logic, or domain-specific wiring.
 * Use when: a create-group affordance needs an icon that scales with `currentColor`.
 */
interface IconNewGroupProps {
  readonly size?: number;
  readonly className?: string;
}

export function IconNewGroup({
  size = 16,
  className,
}: Readonly<IconNewGroupProps>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 18 18"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <circle cx="6.2" cy="6.2" r="2.2" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="11.8" cy="7.2" r="1.8" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M2.8 13.3c.7-1.7 2.1-2.7 3.9-2.7s3.1 1 3.8 2.7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path d="M14.6 11.8v4M12.6 13.8h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
