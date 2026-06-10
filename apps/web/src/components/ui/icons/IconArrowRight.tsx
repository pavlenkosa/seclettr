/** IconArrowRight — inline SVG right-arrow glyph for navigation and directional affordances. */
interface IconArrowRightProps {
  readonly size?: number;
  readonly className?: string;
}

export function IconArrowRight({ size = 14, className }: Readonly<IconArrowRightProps>) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
