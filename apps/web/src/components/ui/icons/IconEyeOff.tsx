/**
 * IconEyeOff — inline SVG eye-off/visibility-off glyph rendered as a presentational icon.
 */
interface Props {
  readonly size?: number;
  readonly strokeWidth?: number;
}

export function IconEyeOff({ size = 18, strokeWidth = 1.75 }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M1 1l22 22" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
