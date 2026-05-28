import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/i18n";
import { IconLock } from "@/components/ui/icons";
import { getBiometricEnabled } from "@/lib/app-lock-password";
import { checkBiometricAvailability, retrievePinBiometric } from "@/lib/native-biometric";
import styles from "./LockScreen.module.css";

interface Props {
  readonly username: string | null;
  readonly isUnlocking: boolean;
  readonly pinWrong?: boolean;
  readonly errorMessage?: string;
  readonly onUnlock: (passcode: string) => void;
  readonly onLogout: () => void;
}

const LockIcon = (
  <div className={styles.lockIcon} aria-hidden="true">
    <IconLock size={28} />
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
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    {/* outer arc — top of finger */}
    <path d="M7 9.5C7 6.46 9.24 4 12 4s5 2.46 5 5.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    {/* middle arc */}
    <path d="M9 11c0-1.66 1.34-3 3-3s3 1.34 3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    {/* center ridge — vertical loop */}
    <path d="M12 10v4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    {/* lower-left arc */}
    <path d="M5.5 13.5C5.5 10.46 8.46 8 12 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    {/* lower-right arc */}
    <path d="M18.5 13.5C18.5 10.46 15.54 8 12 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    {/* bottom ridge */}
    <path d="M8.5 16c.7 1.1 1.96 1.8 3.5 1.8s2.8-.7 3.5-1.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

type BiometryKind = "face" | "fingerprint" | null;

function getBiometryKind(biometryType: string): BiometryKind {
  if (biometryType === "FaceID" || biometryType === "FaceAuthentication") return "face";
  if (biometryType === "TouchID" || biometryType === "Fingerprint" || biometryType === "MultipleFingerprint") return "fingerprint";
  return null;
}

export function LockScreen({ username, isUnlocking, pinWrong, errorMessage, onUnlock, onLogout }: Props) {
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

  // When the biometric prompt closes (pending → not pending) without starting
  // an unlock flow, bring focus back to the passcode input so the user does
  // not have to tap/click manually before typing their passcode.
  const prevBiometricPendingRef = useRef(false);
  useEffect(() => {
    const was = prevBiometricPendingRef.current;
    prevBiometricPendingRef.current = biometricPending;
    if (was && !biometricPending && !isUnlocking) {
      inputRef.current?.focus();
    }
  }, [biometricPending, isUnlocking]);

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
          {!pinWrong && errorMessage && (
            <p className={styles.error} role="alert">{errorMessage}</p>
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
