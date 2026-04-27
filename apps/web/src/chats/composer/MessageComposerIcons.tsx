export interface MessageComposerIconProps {
  readonly size?: number;
}

/**
 * Microphone glyph used by the composer recording controls.
 */
export function VoiceNoteIcon({ size = 18 }: MessageComposerIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none">
      <path d="M9 2.35a2.35 2.35 0 0 1 2.35 2.35v3.65a2.35 2.35 0 1 1-4.7 0V4.7A2.35 2.35 0 0 1 9 2.35Z" fill="currentColor" />
      <path d="M4.35 8a.75.75 0 0 1 1.5 0 3.15 3.15 0 0 0 6.3 0 .75.75 0 0 1 1.5 0 4.66 4.66 0 0 1-3.9 4.6V14h1.3a.75.75 0 0 1 0 1.5H6.95a.75.75 0 0 1 0-1.5h1.3v-1.4A4.66 4.66 0 0 1 4.35 8Z" fill="currentColor" />
    </svg>
  );
}

/**
 * Camera glyph used by the composer recording controls.
 */
export function VideoNoteIcon({ size = 18 }: MessageComposerIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none">
      <rect x="2.1" y="4" width="9.2" height="10" rx="1.8" stroke="currentColor" strokeWidth="1.35" />
      <path d="M11.8 6.7 15.4 5v8l-3.6-1.7V6.7Z" fill="currentColor" />
    </svg>
  );
}
