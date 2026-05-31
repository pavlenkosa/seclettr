interface IconVideoPlayProps {
  readonly size?: number;
  readonly className?: string;
}

export function IconVideoPlay({ size = 28, className }: Readonly<IconVideoPlayProps>) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" aria-hidden="true" className={className}>
      <circle cx="14" cy="14" r="14" fill="rgb(0 0 0 / 0.42)" />
      <path d="M11 9.5l9 4.5-9 4.5V9.5Z" fill="white" />
    </svg>
  );
}
