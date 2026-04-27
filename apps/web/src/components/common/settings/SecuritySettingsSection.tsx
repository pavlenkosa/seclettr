import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useI18n } from "@/i18n";
import type { AutoDecryptMedia, CallSecurityMode } from "@/ui-settings";
import { useAuthStore } from "@/stores/auth";
import { PillButton, SegmentedControl } from "@/components/ui";
import { SettingsGroup, SettingsRow } from "./SettingsSectionPrimitives";
import styles from "../SettingsModal.module.css";

const CALL_SECURITY_MODES: CallSecurityMode[] = ["compatibility", "balanced", "strict"];
const AUTO_DECRYPT_MEDIA_MODES: AutoDecryptMedia[] = ["on", "off"];
type PinFeedbackState = { kind: "error" | "success"; msg: string };
type PinFeedbackMessageProps = Readonly<{
  feedback: PinFeedbackState;
  bottom?: boolean;
}>;

interface SecuritySettingsSectionProps {
  readonly callSecurityMode: CallSecurityMode;
  readonly autoDecryptMedia: AutoDecryptMedia;
  readonly setCallSecurityMode: (next: CallSecurityMode) => void;
  readonly setAutoDecryptMedia: (next: AutoDecryptMedia) => void;
}

function sanitizePinInput(value: string): string {
  return value.replaceAll(/\D/g, "").slice(0, 4);
}

function getPinFeedbackClassName(feedback: PinFeedbackState, bottom = false): string {
  return [
    styles.pinFeedback,
    bottom ? styles.pinFeedbackBottom : "",
    feedback.kind === "error" ? styles.pinFeedbackError : styles.pinFeedbackSuccess,
  ].join(" ");
}

function PinFeedbackMessage({
  feedback,
  bottom = false,
}: PinFeedbackMessageProps) {
  return (
    <p className={getPinFeedbackClassName(feedback, bottom)}>
      {feedback.msg}
    </p>
  );
}

function AppLockSection() {
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
    if (newPin.length !== 4 || !/^\d{4}$/.test(newPin)) {
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
    setNewPin(sanitizePinInput(value));
    setFeedback(null);
  };
  const handleConfirmPinChange = (value: string) => {
    setConfirmPin(sanitizePinInput(value));
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
              appearance="soft"
              size="sm"
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
                size="sm"
                onClick={handleRemoveClick}
                disabled={busy}
              >
                {t("settings.appLock.removePin")}
              </PillButton>
            ) : null}
          </div>
        ) : (
          <div className={styles.pinInputGroup}>
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              pattern="\d{4}"
              placeholder={t("settings.appLock.pinEntry.new")}
              value={newPin}
              onChange={(event) => handleNewPinChange(event.target.value)}
              disabled={busy}
              className={styles.pinInput}
            />
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              pattern="\d{4}"
              placeholder={t("settings.appLock.pinEntry.confirm")}
              value={confirmPin}
              onChange={(event) => handleConfirmPinChange(event.target.value)}
              disabled={busy}
              className={styles.pinInput}
            />
            {feedback ? (
              <PinFeedbackMessage feedback={feedback} />
            ) : null}
            <div className={styles.pinButtonRow}>
              <PillButton
                type="button"
                tone="accent"
                appearance="soft"
                size="sm"
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
                size="sm"
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
    </SettingsGroup>
  );
}

export function SecuritySettingsSection({
  callSecurityMode,
  autoDecryptMedia,
  setCallSecurityMode,
  setAutoDecryptMedia,
}: SecuritySettingsSectionProps) {
  const { t } = useI18n();

  const callSecurityOptions = CALL_SECURITY_MODES.map((mode) => ({ value: mode, label: t(`settings.callSecurity.${mode}`) }));
  const autoDecryptOptions = AUTO_DECRYPT_MEDIA_MODES.map((mode) => ({ value: mode, label: t(`settings.autoDecryptMedia.${mode}`) }));

  return (
    <div className={styles.groupStack}>
      <SettingsGroup
        eyebrow={t("settings.groups.security.calls")}
        title={t("settings.groups.security.calls.title")}
        description={t("settings.groups.security.calls.description")}
        tone="strong"
      >
        <SettingsRow
          label={t("settings.callSecurity")}
          description={t(`settings.callSecurity.${callSecurityMode}.description`)}
          secondaryDescription={t("settings.callSecurity.scopeDescription")}
          layout="stacked"
        >
          <SegmentedControl
            value={callSecurityMode}
            onChange={setCallSecurityMode}
            ariaLabel={t("settings.callSecurity")}
            options={callSecurityOptions}
          />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup
        eyebrow={t("settings.groups.security.media")}
        title={t("settings.groups.security.media.title")}
        description={t("settings.groups.security.media.description")}
      >
        <SettingsRow
          label={t("settings.autoDecryptMedia")}
          description={t("settings.autoDecryptMedia.description")}
        >
          <SegmentedControl
            value={autoDecryptMedia}
            onChange={setAutoDecryptMedia}
            ariaLabel={t("settings.autoDecryptMedia")}
            grouped
            options={autoDecryptOptions}
          />
        </SettingsRow>
      </SettingsGroup>

      <AppLockSection />
    </div>
  );
}
