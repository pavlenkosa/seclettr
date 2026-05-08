import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/i18n";
import styles from "./LockScreen.module.css";

interface Props {
  readonly username: string | null;
  readonly isUnlocking: boolean;
  readonly pinWrong?: boolean;
  readonly onUnlock: (passcode: string) => void;
  readonly onLogout: () => void;
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
  const [passcode, setPasscode] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (pinWrong) {
      setPasscode("");
      inputRef.current?.focus();
    }
  }, [pinWrong]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (passcode.length > 0 && !isUnlocking) {
      onUnlock(passcode);
    }
  }

  return (
    <dialog open className={styles.root} aria-modal="true" aria-labelledby="lock-title">
      <div className={styles.card}>
        {LockIcon}

        <h1 id="lock-title" className={styles.title}>{t("lock.pin.title")}</h1>
        {username && <p className={styles.username}>@{username}</p>}

        <form className={styles.passcodeForm} onSubmit={handleSubmit} noValidate>
          <input
            ref={inputRef}
            type="password"
            autoComplete="current-password"
            className={`${styles.passcodeInput} ${pinWrong ? styles.passcodeInputError : ""}`}
            placeholder={t("lock.pin.placeholder")}
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            disabled={isUnlocking}
            aria-label={t("lock.pin.hint")}
            aria-invalid={pinWrong}
          />
          {pinWrong && (
            <p className={styles.error} role="alert">{t("lock.pin.error")}</p>
          )}
          <button
            type="submit"
            className={styles.unlockBtn}
            disabled={isUnlocking || passcode.length === 0}
          >
            {isUnlocking ? t("lock.pin.unlocking") : t("lock.pin.unlock")}
          </button>
        </form>

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
