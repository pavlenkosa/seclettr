import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/i18n";
import { getBiometricEnabled } from "@/lib/app-lock-password";
import { checkBiometricAvailability, retrievePinBiometric } from "@/lib/native-biometric";
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

const FaceIdIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="3" y="3" width="6" height="4" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
    <rect x="15" y="3" width="6" height="4" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
    <rect x="3" y="17" width="6" height="4" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
    <rect x="15" y="17" width="6" height="4" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="9" cy="10" r="1.2" fill="currentColor" />
    <circle cx="15" cy="10" r="1.2" fill="currentColor" />
    <path d="M9 15.5c0-1.657 1.343-3 3-3s3 1.343 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const FingerprintIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M12 4C8.134 4 5 7.134 5 11v3M19 11c0-2.64-1.358-4.961-3.41-6.32" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M9 14c0-1.657 1.343-3 3-3s3 1.343 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M12 11v4M8 17c.552 1.198 1.688 2 3 2h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

type BiometryKind = "face" | "fingerprint" | null;

function getBiometryKind(biometryType: string): BiometryKind {
  if (biometryType === "FaceID" || biometryType === "FaceAuthentication") return "face";
  if (biometryType === "TouchID" || biometryType === "Fingerprint" || biometryType === "MultipleFingerprint") return "fingerprint";
  return null;
}

export function LockScreen({ username, isUnlocking, pinWrong, onUnlock, onLogout }: Props) {
  const { t } = useI18n();
  const [passcode, setPasscode] = useState("");
  const [biometryKind, setBiometryKind] = useState<BiometryKind>(null);
  const [biometricPending, setBiometricPending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const tryBiometric = useCallback(async () => {
    if (biometricPending || isUnlocking) return;
    setBiometricPending(true);
    try {
      const pin = await retrievePinBiometric(t("lock.biometric.reason"));
      if (pin) {
        onUnlock(pin);
      }
    } finally {
      setBiometricPending(false);
    }
  }, [biometricPending, isUnlocking, onUnlock, t]);

  useEffect(() => {
    void checkBiometricAvailability().then((avail) => {
      // Only activate biometric unlock if hardware is available AND the user
      // has not explicitly disabled it (getBiometricEnabled flag).
      if (avail.available && getBiometricEnabled()) {
        setBiometryKind(getBiometryKind(avail.biometryType));
        void tryBiometric();
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (pinWrong) {
      setPasscode("");
      inputRef.current?.focus();
    }
  }, [pinWrong]);

  useEffect(() => {
    if (!biometryKind) {
      inputRef.current?.focus();
    }
  }, [biometryKind]);

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
            disabled={isUnlocking || biometricPending}
            aria-label={t("lock.pin.hint")}
            aria-invalid={pinWrong}
          />
          {pinWrong && (
            <p className={styles.error} role="alert">{t("lock.pin.error")}</p>
          )}
          <button
            type="submit"
            className={styles.unlockBtn}
            disabled={isUnlocking || biometricPending || passcode.length === 0}
          >
            {isUnlocking ? t("lock.pin.unlocking") : t("lock.pin.unlock")}
          </button>
        </form>

        {biometryKind && (
          <button
            type="button"
            className={styles.biometricBtn}
            onClick={() => void tryBiometric()}
            disabled={isUnlocking || biometricPending}
            aria-label={t(biometryKind === "face" ? "lock.biometric.face" : "lock.biometric.fingerprint")}
          >
            {biometryKind === "face" ? FaceIdIcon : FingerprintIcon}
            {t(biometryKind === "face" ? "lock.biometric.face" : "lock.biometric.fingerprint")}
          </button>
        )}

        <button
          type="button"
          className={styles.logoutBtn}
          onClick={onLogout}
          disabled={isUnlocking || biometricPending}
        >
          {t("lock.logout")}
        </button>
      </div>
    </dialog>
  );
}
