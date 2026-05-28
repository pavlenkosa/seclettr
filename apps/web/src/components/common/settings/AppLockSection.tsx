/**
 * AppLockSection — PIN setup/removal and biometric unlock group for Security settings.
 *
 * Owns:
 *   - PIN form state machine (idle ↔ set), save/remove flows, error mapping.
 *   - `BiometricUnlockRow` mount (rendered as the last row in the group).
 *
 * Does not own:
 *   - Biometric enable/disable flow (belongs in BiometricUnlockRow.tsx).
 *   - Auth store PIN persistence (belongs in @/stores/auth via setPin/removePin).
 *
 * CSS: shared with siblings via `./SecuritySettingsSection.module.css` —
 *   see BiometricUnlockRow.tsx for the rationale.
 */
import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useI18n } from "@/i18n";
import { useAuthStore } from "@/stores/auth";
import { InputField, PillButton } from "@/components/ui";
import { logger } from "@/lib/logger";
import { SettingsGroup, SettingsRow } from "./SettingsSectionPrimitives";
import { BiometricUnlockRow, PinFeedbackMessage, type PinFeedbackState } from "./BiometricUnlockRow";
import styles from "./SecuritySettingsSection.module.css";

export function AppLockSection({ flat = false }: { readonly flat?: boolean }) {
  const { t } = useI18n();
  const {
    authLifecycle,
    pinEnabled,
    storageKeyVolatile,
    setPin,
    removePin,
  } = useAuthStore(useShallow((state) => ({
    authLifecycle: state.authLifecycle,
    pinEnabled: state.pinEnabled,
    storageKeyVolatile: state.storageKeyVolatile,
    setPin: state.setPin,
    removePin: state.removePin,
  })));
  const [mode, setMode] = useState<"idle" | "set">("idle");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [feedback, setFeedback] = useState<PinFeedbackState | null>(null);
  const [busy, setBusy] = useState(false);
  const pinSetupBlocked = storageKeyVolatile || authLifecycle !== "ready";

  const mapPinError = (error: unknown) => {
    logger.error("[AppLock] setPin failed:", error);
    if (error instanceof Error) {
      if (error.message === "pin_requires_active_session") {
        return t("settings.appLock.pinEntry.sessionRequired");
      }
      if (error.message === "storage_key_lock_persist_failed") {
        return t("settings.appLock.pinEntry.persistenceUnavailable");
      }
    }

    return t("settings.appLock.pinEntry.failed");
  };

  const handleSave = async () => {
    if (newPin.length < 4) {
      setFeedback({ kind: "error", msg: t("settings.appLock.pinEntry.tooShort") });
      return;
    }
    if (newPin !== confirmPin) {
      setFeedback({ kind: "error", msg: t("settings.appLock.pinEntry.mismatch") });
      return;
    }
    setBusy(true);
    try {
      await setPin(newPin);
      setMode("idle");
      setNewPin("");
      setConfirmPin("");
      setFeedback({ kind: "success", msg: t("settings.appLock.pinEntry.saved") });
    } catch (error) {
      setFeedback({ kind: "error", msg: mapPinError(error) });
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async () => {
    setBusy(true);
    try {
      await removePin();
      setMode("idle");
      setFeedback({ kind: "success", msg: t("settings.appLock.pinEntry.removed") });
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = () => {
    setMode("idle");
    setNewPin("");
    setConfirmPin("");
    setFeedback(null);
  };
  const handleStartPinSetup = () => {
    setFeedback(null);
    setMode("set");
  };
  const handleRemoveClick = () => {
    setFeedback(null);
    void handleRemove();
  };
  const handleNewPinChange = (value: string) => {
    setNewPin(value);
    setFeedback(null);
  };
  const handleConfirmPinChange = (value: string) => {
    setConfirmPin(value);
    setFeedback(null);
  };

  const sessionReady = authLifecycle === "ready";
  const sessionRequiredMessage = sessionReady
    ? null
    : t("settings.appLock.pinEntry.sessionRequired");
  const helperMessage = storageKeyVolatile
    ? t("settings.appLock.pinEntry.persistenceUnavailable")
    : sessionRequiredMessage;

  return (
    <SettingsGroup
      eyebrow={t("settings.groups.security.appLock")}
      title={t("settings.groups.security.appLock.title")}
      description={t("settings.groups.security.appLock.description")}
      flat={flat}
    >
      <SettingsRow
        label={t("settings.appLock.pin")}
        description={t("settings.appLock.pin.description")}
        layout={mode === "idle" ? "inline" : "stacked"}
      >
        {mode === "idle" ? (
          <div className={styles.pinButtonRow}>
            <PillButton
              type="button"
              tone="accent"
              appearance="strong"
              size="md"
              fullWidth
              onClick={handleStartPinSetup}
              disabled={busy || pinSetupBlocked}
            >
              {pinEnabled ? t("settings.appLock.changePin") : t("settings.appLock.setPin")}
            </PillButton>
            {pinEnabled ? (
              <PillButton
                type="button"
                tone="danger"
                appearance="soft"
                size="md"
                fullWidth
                onClick={handleRemoveClick}
                disabled={busy}
              >
                {t("settings.appLock.removePin")}
              </PillButton>
            ) : null}
          </div>
        ) : (
          <div className={styles.pinInputGroup}>
            <InputField
              type="password"
              autoComplete="new-password"
              placeholder={t("settings.appLock.pinEntry.new")}
              aria-label={t("settings.appLock.pinEntry.new")}
              value={newPin}
              onChange={(event) => handleNewPinChange(event.target.value)}
              disabled={busy}
              wrapperClassName={styles.pinInput}
            />
            <InputField
              type="password"
              autoComplete="new-password"
              placeholder={t("settings.appLock.pinEntry.confirm")}
              aria-label={t("settings.appLock.pinEntry.confirm")}
              value={confirmPin}
              onChange={(event) => handleConfirmPinChange(event.target.value)}
              disabled={busy}
              wrapperClassName={styles.pinInput}
            />
            {feedback ? (
              <PinFeedbackMessage feedback={feedback} />
            ) : null}
            <div className={styles.pinButtonRow}>
              <PillButton
                type="button"
                tone="accent"
                appearance="strong"
                size="md"
                fullWidth
                onClick={() => {
                  void handleSave();
                }}
                disabled={busy}
              >
                {t("settings.appLock.pinEntry.save")}
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
      </SettingsRow>
      {mode === "idle" && helperMessage ? (
        <p className={`${styles.pinFeedback} ${styles.pinFeedbackBottom} ${styles.pinFeedbackError}`}>
          {helperMessage}
        </p>
      ) : null}
      {mode === "idle" && feedback ? (
        <PinFeedbackMessage feedback={feedback} bottom />
      ) : null}
      <BiometricUnlockRow />
    </SettingsGroup>
  );
}
