/**
 * BiometricUnlockRow — biometric unlock toggle row for the App Lock settings section.
 *
 * Owns:
 *   - `PinFeedbackState` type, `getPinFeedbackClassName` helper, `PinFeedbackMessage`
 *     component — shared by sibling `AppLockSection.tsx`.
 *   - `BiometricUnlockRow` — checks biometric availability, handles enable/disable
 *     flow (PIN verification → secure-enclave store), syncs flag with auth store.
 *
 * Does not own:
 *   - PIN set/remove logic (belongs in AppLockSection.tsx).
 *   - Native biometric prompt implementation (belongs in @/lib/native-biometric).
 *
 * CSS: shared with siblings via `./SecuritySettingsSection.module.css`
 *   (AppLockSection, BiometricUnlockRow, TransferSection all use the same module —
 *   originally one file; the CSS was not split when the TSX was extracted).
 */
import { useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useI18n } from "@/i18n";
import { useAuthStore } from "@/stores/auth";
import { InputField, PillButton } from "@/components/ui";
import {
  getBiometricEnabled,
  setBiometricEnabledFlag,
  verifyPin,
} from "@/lib/app-lock-password";
import {
  checkBiometricAvailability,
  clearPinBiometric,
  storePinBiometric,
  type BiometricAvailability,
} from "@/lib/native-biometric";
import { SettingsRow } from "./SettingsSectionPrimitives";
import styles from "./SecuritySettingsSection.module.css";

export type PinFeedbackState = { kind: "error" | "success"; msg: string };
type PinFeedbackMessageProps = Readonly<{
  feedback: PinFeedbackState;
  bottom?: boolean;
}>;

export function getPinFeedbackClassName(feedback: PinFeedbackState, bottom = false): string {
  return [
    styles.pinFeedback,
    bottom ? styles.pinFeedbackBottom : "",
    feedback.kind === "error" ? styles.pinFeedbackError : styles.pinFeedbackSuccess,
  ].join(" ");
}

export function PinFeedbackMessage({
  feedback,
  bottom = false,
}: PinFeedbackMessageProps) {
  return (
    <p className={getPinFeedbackClassName(feedback, bottom)}>
      {feedback.msg}
    </p>
  );
}

export function BiometricUnlockRow() {
  const { t } = useI18n();
  const { pinEnabled, storageKeyVolatile } = useAuthStore(useShallow((state) => ({
    pinEnabled: state.pinEnabled,
    storageKeyVolatile: state.storageKeyVolatile,
  })));
  const [avail, setAvail] = useState<BiometricAvailability | null>(null);
  const [biometricOn, setBiometricOn] = useState(() => getBiometricEnabled());
  const [mode, setMode] = useState<"idle" | "enable">("idle");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<PinFeedbackState | null>(null);

  useEffect(() => {
    void checkBiometricAvailability().then(setAvail);
  }, []);

  // Re-sync biometric flag when PIN is set for the first time (pinEnabled: false→true)
  // or removed (true→false). Also subscribes to storageKeyVolatile for the rare edge
  // case where IDB persistence state changes.
  useEffect(() => {
    setBiometricOn(getBiometricEnabled());
    setMode("idle");
    setPin("");
    setFeedback(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinEnabled, storageKeyVolatile]);

  if (!pinEnabled || !avail?.available) return null;

  const handleDisable = async () => {
    setBusy(true);
    try {
      await clearPinBiometric();
      setBiometricEnabledFlag(false);
      setBiometricOn(false);
      setFeedback({ kind: "success", msg: t("settings.appLock.biometric.disabled") });
    } finally {
      setBusy(false);
    }
  };

  const handleEnable = async () => {
    if (!pin) {
      setFeedback({ kind: "error", msg: t("settings.appLock.biometric.enterPin") });
      return;
    }
    setBusy(true);
    try {
      // 1. Verify the passcode is correct before storing it biometrically.
      const pinOk = await verifyPin(pin).catch(() => false);
      if (!pinOk) {
        setFeedback({ kind: "error", msg: t("lock.pin.error") });
        return;
      }
      // 2. Store the PIN in the secure enclave (no prior verifyIdentity needed —
      //    setCredentials uses EncryptedSharedPreferences which does not require
      //    an active biometric auth token; calling verifyIdentity first would
      //    consume the token and make the subsequent write fail on Android).
      const stored = await storePinBiometric(pin);
      if (stored) {
        setBiometricEnabledFlag(true);
        setBiometricOn(true);
        setMode("idle");
        setPin("");
        setFeedback({ kind: "success", msg: t("settings.appLock.biometric.enabled") });
      } else {
        setFeedback({ kind: "error", msg: t("settings.appLock.biometric.failed") });
      }
    } finally {
      setBusy(false);
    }
  };

  const handleStartEnable = () => {
    setFeedback(null);
    setPin("");
    setMode("enable");
  };

  const handleCancel = () => {
    setMode("idle");
    setPin("");
    setFeedback(null);
  };

  return (
    <SettingsRow
      label={t("settings.appLock.biometric")}
      description={t("settings.appLock.biometric.description")}
      layout={mode === "enable" ? "stacked" : "inline"}
    >
      {mode === "idle" ? (
        <div className={styles.pinButtonRow}>
          {biometricOn ? (
            <PillButton
              type="button"
              tone="danger"
              appearance="soft"
              size="md"
              fullWidth
              onClick={() => { void handleDisable(); }}
              disabled={busy}
            >
              {t("settings.appLock.biometric.disable")}
            </PillButton>
          ) : (
            <PillButton
              type="button"
              tone="accent"
              appearance="strong"
              size="md"
              fullWidth
              onClick={handleStartEnable}
              disabled={busy}
            >
              {t("settings.appLock.biometric.enable")}
            </PillButton>
          )}
        </div>
      ) : (
        <div className={styles.pinInputGroup}>
          <p className={styles.pinHint}>{t("settings.appLock.biometric.enterPin")}</p>
          <InputField
            type="password"
            autoComplete="current-password"
            placeholder={t("settings.appLock.pin")}
            aria-label={t("settings.appLock.pin")}
            value={pin}
            onChange={(e) => { setPin(e.target.value); setFeedback(null); }}
            disabled={busy}
            wrapperClassName={styles.pinInput}
          />
          {feedback ? <PinFeedbackMessage feedback={feedback} /> : null}
          <div className={styles.pinButtonRow}>
            <PillButton
              type="button"
              tone="accent"
              appearance="strong"
              size="md"
              fullWidth
              onClick={() => { void handleEnable(); }}
              disabled={busy}
            >
              {t("settings.appLock.biometric.enable")}
            </PillButton>
            <PillButton
              type="button"
              tone="neutral"
              appearance="soft"
              size="md"
              fullWidth
              onClick={handleCancel}
              disabled={busy}
            >
              {t("settings.appLock.pinEntry.cancel")}
            </PillButton>
          </div>
        </div>
      )}
      {mode === "idle" && feedback ? (
        <PinFeedbackMessage feedback={feedback} bottom />
      ) : null}
    </SettingsRow>
  );
}
