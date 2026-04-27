import { useEffect, useState } from "react";
import { useI18n } from "@/i18n";
import styles from "./LockScreen.module.css";

const PIN_LENGTH = 4;

interface Props {
  readonly username: string | null;
  readonly isUnlocking: boolean;
  readonly pinWrong?: boolean;
  readonly onUnlock: (pin: string) => void;
  readonly onLogout: () => void;
}

const PIN_DOT_INDICES = Array.from({ length: PIN_LENGTH }, (_, i) => `dot-${i}`);

function PinDots({ filled }: { readonly filled: number }) {
  return (
    <div className={styles.pinDots} aria-hidden="true">
      {PIN_DOT_INDICES.map((dotKey, i) => (
        <span
          key={dotKey}
          className={`${styles.pinDot} ${i < filled ? styles.pinDotFilled : ""}`}
        />
      ))}
    </div>
  );
}

const PAD_KEYS = [
  "1", "2", "3",
  "4", "5", "6",
  "7", "8", "9",
  "", "0", "⌫",
] as const;

interface PinPadProps {
  readonly onDigit: (d: string) => void;
  readonly onDelete: () => void;
  readonly disabled: boolean;
}

function PinPad({ onDigit, onDelete, disabled }: PinPadProps) {
  const { t } = useI18n();
  return (
    <fieldset className={styles.pinPad} aria-label={t("lock.pin.padAriaLabel")}>
      {PAD_KEYS.map((key) => {
        if (key === "") {
          return <span key="pad-spacer" className={styles.pinPadSpacer} aria-hidden="true" />;
        }
        if (key === "⌫") {
          return (
            <button
              key="pad-delete"
              type="button"
              className={`${styles.pinKey} ${styles.pinKeyDelete}`}
              onClick={onDelete}
              disabled={disabled}
              aria-label={t("lock.pin.delete")}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M20 6H9L2 12l7 6h11a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                <path d="m15 10-4 4m0-4 4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          );
        }
        return (
          <button
            key={`pad-${key}`}
            type="button"
            className={styles.pinKey}
            onClick={() => onDigit(key)}
            disabled={disabled}
            aria-label={key}
          >
            {key}
          </button>
        );
      })}
    </fieldset>
  );
}

const LockIcon = (
  <div className={styles.lockIcon} aria-hidden="true">
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
      <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  </div>
);

export function LockScreen({ username, isUnlocking, pinWrong, onUnlock, onLogout }: Props) {
  const { t } = useI18n();
  const [pin, setPin] = useState("");

  useEffect(() => {
    if (pinWrong) {
      setPin("");
    }
  }, [pinWrong]);

  useEffect(() => {
    if (pin.length === PIN_LENGTH) {
      onUnlock(pin);
    }
  // onUnlock changes identity between renders; intentionally depend only on pin
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  const handleDigit = (d: string) => {
    if (pin.length < PIN_LENGTH) {
      setPin((prev) => prev + d);
    }
  };

  const handleDelete = () => {
    setPin((prev) => prev.slice(0, -1));
  };

  return (
    <dialog open className={styles.root} aria-modal="true" aria-labelledby="lock-title">
      <div className={styles.card}>
        {LockIcon}

        <h1 id="lock-title" className={styles.title}>{t("lock.pin.title")}</h1>
        {username && <p className={styles.username}>@{username}</p>}
        <PinDots filled={pin.length} />
        <p className={`${styles.pinHint} ${pinWrong ? styles.pinHintError : ""}`}>
          {pinWrong ? t("lock.pin.error") : t("lock.pin.hint")}
        </p>
        <PinPad onDigit={handleDigit} onDelete={handleDelete} disabled={isUnlocking} />

        <button
          type="button"
          className={styles.logoutBtn}
          onClick={onLogout}
          disabled={isUnlocking}
        >
          {t("lock.logout")}
        </button>
      </div>
    </dialog>
  );
}
