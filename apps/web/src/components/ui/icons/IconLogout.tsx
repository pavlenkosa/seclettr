/**
 * IconLogout — inline SVG logout/sign-out glyph rendered as a presentational icon.
 */
interface Props {
  readonly size?: number;
  readonly strokeWidth?: number;
}

export function IconLogout({ size = 16, strokeWidth = 1.5 }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path
        d="M6.75 15.75H3.75A1.5 1.5 0 0 1 2.25 14.25V3.75A1.5 1.5 0 0 1 3.75 2.25h3M12 12.75l3.75-3.75L12 5.25M15.75 9H7.5"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
