/** IconImage — inline SVG image/photo glyph for media and attachment affordances. */
interface IconImageProps {
  readonly size?: number;
  readonly className?: string;
}

export function IconImage({ size = 24, className }: Readonly<IconImageProps>) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" />
      <path d="M21 15l-5-5-4 4-2-2-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
