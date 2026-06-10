/** IconVideoCircle — inline SVG video-in-circle glyph for call and media affordances. */
interface IconVideoCircleProps {
  readonly size?: number;
  readonly className?: string;
}

export function IconVideoCircle({ size = 24, className }: Readonly<IconVideoCircleProps>) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 8.5l6 3.5-6 3.5V8.5Z" fill="currentColor" />
    </svg>
  );
}
