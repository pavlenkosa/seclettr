import { useId } from "react";

interface Props {
  readonly className?: string;
  readonly decorative?: boolean;
}

/**
 * Shared Seclettr brand mark used across auth, navigation, and empty-state surfaces.
 * It inherits its palette from accent-aware global tokens so the logo stays aligned
 * with the active theme and accent selection without local overrides.
 */
export function SeclettrMark({ className, decorative = false }: Props) {
  const gradientSeed = useId().replaceAll(":", "");
  const primaryGradientId = `${gradientSeed}-primary`;
  const accentGradientId = `${gradientSeed}-accent`;
  const baseGradientId = `${gradientSeed}-base`;

  return (
    <svg
      viewBox="0 0 1024 1024"
      fill="none"
      className={className}
      role="img"
      aria-hidden={decorative ? "true" : undefined}
      aria-label={decorative ? undefined : "Seclettr"}
      style={{ filter: "var(--brand-mark-filter, none)" }}
    >
      <defs>
        <linearGradient id={primaryGradientId} x1="696.66" y1="729.63" x2="349.01" y2="349.7" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="var(--brand-mark-primary-start, #2b7fff)" />
          <stop offset="0.58" stopColor="var(--brand-mark-primary-mid, #1d4ed8)" />
          <stop offset="1" stopColor="var(--brand-mark-primary-end, #082f74)" />
        </linearGradient>
        <linearGradient id={accentGradientId} x1="397.83" y1="388.04" x2="588.58" y2="141.77" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="var(--brand-mark-accent-start, #7dd3fc)" />
          <stop offset="0.56" stopColor="var(--brand-mark-accent-mid, #38bdf8)" />
          <stop offset="1" stopColor="var(--brand-mark-accent-end, #2563eb)" />
        </linearGradient>
        <linearGradient id={baseGradientId} x1="534.72" y1="960.76" x2="534.72" y2="37.44" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="var(--brand-mark-base-start, #164092)" />
          <stop offset="0.46" stopColor="var(--brand-mark-base-mid, #1d4ed8)" />
          <stop offset="1" stopColor="var(--brand-mark-base-end, #0b2a66)" />
        </linearGradient>
      </defs>
      <path
        d="M696.61,633.24c24.37-15.02,55.61,4.36,58.61,14.6,2.57,8.74.56,21.06-7.31,25.62l-92.02,53.3c-10.74,6.22-21.29,8.67-33.82,4.03l-343.73-127.23c-13.89-5.14-23.59-11.27-23.64-27.56l-.32-93.25c-.02-5.03,2.39-12.42,5.21-15.08s12.24-5.25,16.01-3.97l23.42,7.9c8.37,2.83,14.8,10.44,14.86,19.48l.37,58.6,319.98,118.81c22.18-11.46,41.79-22.58,62.36-35.26Z"
        fill={`url(#${primaryGradientId})`}
      />
      <path
        d="M722.88,491.81c-10.04-4.21-12.99-12.93-13.09-22.77l-.62-55.61-323.53-119.09-74.62,42.9c-3.86,2.22-44.84-4.2-47.57-26.39-1.26-10.23,5.82-19.35,14.94-24.56l96.58-55.05c6.57-3.75,20.58-.36,28.34,2.51l352.08,130.18c11.64,4.3,14.85,20.01,14.78,30.72l-.64,93.77c-.07,10.56-11.45,18.14-21.22,14.05l-25.44-10.67Z"
        fill={`url(#${accentGradientId})`}
      />
      <path
        d="M771.06,988.56l-110.96-74.26-504.34-188.38c-12.05-4.5-19.23-14.12-19.22-27.11l.16-224.29c0-7.79,6.08-17.07,11.04-19.94,7.6-4.4,18.4-2.1,25.71.07,17.89,5.3,23.78,13.77,23.73,31.36l-.47,178.92c-.02,8.27,5.4,13.31,13,16.12l461.29,170.5c10,3.7,16.93,2.34,25.2-2.46l131.14-76.17.7-131.11c.02-3.62-4.44-10.36-8.43-11.84L161.07,386.04c-13.39-4.96-24.46-12.27-24.46-28.24l.1-206.74c0-15.15,10.13-21.93,21.09-28.3l145.15-84.4c6.57-3.82,17.05-3.67,24.74-.83l538.58,198.82c15.49,5.72,21.09,14.7,21.06,31.08l-.41,223.59c-.03,17.46-15.5,27.97-32.02,24.29-10.41-2.32-26.71-10.96-26.74-24.01l-.4-190.03c-.01-6.98-3.3-13.07-9.51-16.95L318.5,100.01l-121.21,70.07-.58,151.1c-.04,11.28,5.9,15.03,15.72,18.65l381.55,140.82,268.89,99.77c13.54,5.02,24.65,10.77,24.6,27.87l-.54,183.87c-.04,13.09-9.96,22.36-20.4,27.8l-94.51,53.93-.96,114.66Z"
        fill={`url(#${baseGradientId})`}
      />
    </svg>
  );
}
