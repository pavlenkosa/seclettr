import { useI18n } from "@/i18n";
import styles from "../MessageList.module.css";

const GHOST_WAVE_BAR_KEYS = Array.from({ length: 12 }, (_, i) => `ghost-bar-${i}`);

/**
 * Props for the encrypted voice-note decrypt action.
 */
interface VoiceDecryptButtonProps {
  readonly loading: boolean;
  readonly onDecrypt: () => void;
  readonly isPlain?: boolean;
}

/**
 * Button shown before a voice note is decrypted (E2EE) or fetched (plain).
 */
export function VoiceDecryptButton({ loading, onDecrypt, isPlain = false }: VoiceDecryptButtonProps) {
  const { t } = useI18n();
  const title = loading
    ? t(isPlain ? "message.voice.loading" : "message.voice.decrypting")
    : t(isPlain ? "message.voice.tapToPlay" : "message.voice.decryptAndPlay");
  const ariaLabel = t(isPlain ? "message.voice.loadAria" : "message.voice.decryptAria");

  return (
    <button
      type="button"
      onClick={onDecrypt}
      disabled={loading}
      className={styles.voiceDecryptBtn}
      aria-label={ariaLabel}
    >
      <span className={styles.voiceDecryptPreview} aria-hidden="true">
        <span className={styles.voiceDecryptGhostWave}>
          {GHOST_WAVE_BAR_KEYS.map((barKey) => (
            <span key={barKey} className={styles.voiceDecryptGhostBar} />
          ))}
        </span>
        <span className={styles.voiceDecryptIcon}>
          {isPlain ? (
            // Plain voice notes aren't encrypted — show a play triangle so the
            // affordance reads as "tap to listen", not "tap to decrypt".
            <svg viewBox="0 0 18 18" fill="none">
              <path d="M6 4.5l8 4.5-8 4.5V4.5Z" fill="currentColor" />
            </svg>
          ) : (
            <svg viewBox="0 0 18 18" fill="none">
              <path
                d="M5.7 8.05V6.7a3.3 3.3 0 1 1 6.6 0v1.35"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <rect
                x="4.35"
                y="8.05"
                width="9.3"
                height="6.25"
                rx="2.05"
                fill="currentColor"
                fillOpacity="0.18"
                stroke="currentColor"
                strokeWidth="1.2"
              />
              <circle cx="9" cy="11.2" r="1" fill="currentColor" />
            </svg>
          )}
        </span>
      </span>
      <span className={styles.voiceDecryptText}>
        <span className={styles.voiceDecryptTitle}>{title}</span>
        <span className={styles.voiceDecryptPlaceholder} aria-hidden="true" />
      </span>
    </button>
  );
}
