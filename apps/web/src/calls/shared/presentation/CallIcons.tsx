/**
 * CallIcons — inline SVG icon components for call controls and overlays.
 *
 * Owns:
 *   - PhoneIcon, CameraIcon, SwitchCameraIcon, HangupIcon
 *   - MinimizeIcon, ExpandIcon, CloseIcon, FocusIcon
 *   - ScreenShareIcon, ShieldIcon, MuteIcon (muted/unmuted variants)
 *   - BluetoothIcon
 *
 * Does not own any state, call logic, or interaction handling.
 * All icons are aria-hidden presentational primitives consumed across
 * direct and group call surfaces.
 */
import { IconClose } from "@/components/ui";

export function PhoneIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path
        d="M3.75 3h3l1.5 3.75-1.875 1.125c.885 1.77 2.25 3.135 4.02 4.02L11.52 10.5 15.27 12v3c0 .828-.672 1.5-1.5 1.5A12.75 12.75 0 0 1 2.25 4.5C2.25 3.672 2.922 3 3.75 3Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CameraIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path
        d="M1.5 5.25A1.5 1.5 0 0 1 3 3.75h9a1.5 1.5 0 0 1 1.5 1.5v7.5A1.5 1.5 0 0 1 12 14.25H3A1.5 1.5 0 0 1 1.5 12.75V5.25Z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M13.5 7.125l3-1.875v7.5l-3-1.875V7.125Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SwitchCameraIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      {/* camera body */}
      <rect x="2" y="5" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" />
      {/* lens */}
      <circle cx="9" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.4" />
      {/* flip arrows in top notch */}
      <path d="M6.5 3.5L8 2l1.5 1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11.5 3.5L10 2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

export function HangupIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M2.75 12.5c1.55-1.65 4.06-2.75 7.25-2.75s5.7 1.1 7.25 2.75"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M6 14.5l-1.25 2.75M14 14.5l1.25 2.75"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function MinimizeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M3 8.5h10"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ExpandIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M4.25 11.75L11.75 4.25M11.75 4.25H6.5M11.75 4.25V9.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CloseIcon() {
  return <IconClose />;
}

export function FocusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M5.25 2.75H3.8c-.58 0-1.05.47-1.05 1.05v1.45M10.75 2.75h1.45c.58 0 1.05.47 1.05 1.05v1.45M13.25 10.75v1.45c0 .58-.47 1.05-1.05 1.05h-1.45M5.25 13.25H3.8c-.58 0-1.05-.47-1.05-1.05v-1.45"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="8" cy="8" r="1.55" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export function ScreenShareIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path
        d="M2.25 4.5A1.5 1.5 0 0 1 3.75 3h10.5a1.5 1.5 0 0 1 1.5 1.5v6a1.5 1.5 0 0 1-1.5 1.5H3.75a1.5 1.5 0 0 1-1.5-1.5v-6Z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M6.75 15h4.5M9 12v3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M6.75 6.375h2.625V9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M11.25 8.625 9.375 6.75"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ShieldIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path
        d="M6 1L9.8 3V5.8C9.8 8 6 10.9 6 10.9C6 10.9 2.2 8 2.2 5.8V3L6 1Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function SpeakerIcon({ speakerOn }: { readonly speakerOn: boolean }) {
  if (speakerOn) {
    return (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <path
          d="M3.75 6.75H6L9 3.75v10.5l-3-3H3.75A.75.75 0 0 1 3 10.5v-3A.75.75 0 0 1 3.75 6.75Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path
          d="M12 6.75a3.75 3.75 0 0 1 0 4.5M13.5 5.25a6 6 0 0 1 0 7.5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path
        d="M3.75 6.75H6L9 3.75v10.5l-3-3H3.75A.75.75 0 0 1 3 10.5v-3A.75.75 0 0 1 3.75 6.75Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M12 6.75l4.5 4.5M16.5 6.75L12 11.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function LockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="3" y="7.5" width="10" height="7" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5.5 7.5V5.5a2.5 2.5 0 0 1 5 0v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="8" cy="11" r="1" fill="currentColor" />
    </svg>
  );
}

export function MuteIcon({ muted }: { readonly muted: boolean }) {
  if (muted) {
    return (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <path
          d="M11.25 5.25V9A2.25 2.25 0 0 1 9 11.25A2.25 2.25 0 0 1 6.75 9V5.25A2.25 2.25 0 0 1 9 3A2.25 2.25 0 0 1 11.25 5.25Z"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <path d="M3 3l12 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path
        d="M11.25 5.25V9A2.25 2.25 0 0 1 9 11.25A2.25 2.25 0 0 1 6.75 9V5.25A2.25 2.25 0 0 1 9 3A2.25 2.25 0 0 1 11.25 5.25Z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M4.5 8.25V9A4.5 4.5 0 1 0 13.5 9V8.25"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function BluetoothIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      {/* Vertical stem */}
      <line x1="9" y1="2" x2="9" y2="16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      {/* Upper right arm: 9,2 → 13,5.5 */}
      <polyline
        points="9,2 13,5.5 9,9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Lower right arm: 9,9 → 13,12.5 → 9,16 */}
      <polyline
        points="9,9 13,12.5 9,16"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
