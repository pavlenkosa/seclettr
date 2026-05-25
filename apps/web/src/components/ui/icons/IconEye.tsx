interface Props {
  readonly size?: number;
  readonly strokeWidth?: number;
}

export function IconEye({ size = 18, strokeWidth = 1.75 }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M1 12S5 4 12 4s11 8 11 8-4 8-11 8S1 12 1 12z" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth={strokeWidth}/>
    </svg>
  );
}
