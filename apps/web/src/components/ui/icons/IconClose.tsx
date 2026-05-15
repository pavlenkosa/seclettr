interface IconCloseProps {
  readonly size?: number;
  readonly strokeWidth?: number;
  readonly className?: string;
}

export function IconClose({
  size = 16,
  strokeWidth = 1.7,
  className,
}: Readonly<IconCloseProps>) {
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
        d="M3 3l10 10M13 3L3 13"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
    </svg>
  );
}
