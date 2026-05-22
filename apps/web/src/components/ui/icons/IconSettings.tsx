/**
 * IconSettings — inline SVG gear/settings glyph rendered as a presentational icon.
 *
 * Owns:
 *   - Rendering a sunburst gear path with configurable size.
 *   - Marking the SVG `aria-hidden` so screen readers skip it.
 *
 * Does not own runtime state, business logic, or domain-specific wiring.
 * Use when: a settings or preferences affordance needs an icon that scales with `currentColor`.
 */
interface IconSettingsProps {
  readonly size?: number;
  readonly className?: string;
}

export function IconSettings({
  size = 16,
  className,
}: Readonly<IconSettingsProps>) {
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
        fill="currentColor"
        d="M9.405 1.05c-.413-1.4-2.397-1.4-2.81 0l-.101.345a1.464 1.464 0 0 1-2.105.872l-.312-.164c-1.265-.666-2.669.738-2.003 2.003l.164.312c.446.847.023 1.89-.872 2.105l-.345.101c-1.4.413-1.4 2.397 0 2.81l.345.101c.895.214 1.318 1.258.872 2.105l-.164.312c-.666 1.265.738 2.669 2.003 2.003l.312-.164a1.464 1.464 0 0 1 2.105.872l.101.345c.413 1.4 2.397 1.4 2.81 0l.101-.345a1.464 1.464 0 0 1 2.105-.872l.312.164c1.265.666 2.669-.738 2.003-2.003l-.164-.312a1.464 1.464 0 0 1 .872-2.105l.345-.101c1.4-.413 1.4-2.397 0-2.81l-.345-.101a1.464 1.464 0 0 1-.872-2.105l.164-.312c.666-1.265-.738-2.669-2.003-2.003l-.312.164a1.464 1.464 0 0 1-2.105-.872l-.101-.345ZM8 5.43a2.57 2.57 0 1 1 0 5.14 2.57 2.57 0 0 1 0-5.14Z"
      />
    </svg>
  );
}
