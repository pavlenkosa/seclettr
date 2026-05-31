interface IconChevronLeftProps {
  readonly size?: number;
  readonly strokeWidth?: number;
  readonly className?: string;
}

export function IconChevronLeft({ size = 16, strokeWidth = 1.7, className }: Readonly<IconChevronLeftProps>) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <path d="M10 3l-5 5 5 5" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
