interface IconMicProps {
  readonly size?: number;
  readonly className?: string;
}

export function IconMic({ size = 24, className }: Readonly<IconMicProps>) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <rect x="9" y="2" width="6" height="13" rx="3" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5 10v2a7 7 0 0 0 14 0v-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M12 19v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
