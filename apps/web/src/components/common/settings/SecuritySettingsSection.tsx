import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useI18n } from "@/i18n";
import type { AutoDecryptMedia, CallSecurityMode } from "@/ui-settings";
import { useAuthStore } from "@/stores/auth";
import { InputField, PillButton, SegmentedControl } from "@/components/ui";
import { exportChatHistory, importChatHistory } from "@/lib/chat-transfer";
import { ApiError } from "@/lib/api";
import { SettingsGroup, SettingsRow } from "./SettingsSectionPrimitives";
import styles from "./SecuritySettingsSection.module.css";

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
    console.error("[AppLock] setPin failed:", error);
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

type TransferMode = "idle" | "export" | "import";
type TransferExportState = "form" | "encrypting" | "uploading" | "done";
type TransferImportState = "form" | "downloading" | "decrypting" | "restoring" | "done";

function TransferSection() {
  const { t } = useI18n();
  const [mode, setMode] = useState<TransferMode>("idle");
  const [password, setPassword] = useState("");
  const [transferCode, setTransferCode] = useState("");
  const [exportState, setExportState] = useState<TransferExportState>("form");
  const [importState, setImportState] = useState<TransferImportState>("form");
  const [resultId, setResultId] = useState("");
  const [resultCount, setResultCount] = useState(0);
  const [codeCopied, setCodeCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setMode("idle");
    setPassword("");
    setTransferCode("");
    setExportState("form");
    setImportState("form");
    setResultId("");
    setResultCount(0);
    setCodeCopied(false);
    setError(null);
  }

  function mapTransferError(err: unknown): string {
    if (err instanceof Error) {
      if (err.message === "transfer_wrong_password") return t("settings.transfer.error.wrongPassword");
      if (err.message === "transfer_blob_too_short") return t("settings.transfer.error.wrongPassword");
      if (err.message === "transfer_invalid_package") return t("settings.transfer.error.wrongPassword");
    }
    if (err instanceof ApiError && err.status === 404) return t("settings.transfer.error.notFound");
    return t("settings.transfer.error.generic");
  }

  async function handleExport() {
    if (!password) { setError(t("settings.transfer.error.emptyPassword")); return; }
    setError(null);
    try {
      const id = await exportChatHistory(password, (p) => {
        if (p.stage === "encrypting") setExportState("encrypting");
        else if (p.stage === "uploading") setExportState("uploading");
        else if (p.stage === "done") { setExportState("done"); setResultId(p.id); }
      });
      setResultId(id);
      setExportState("done");
    } catch (err) {
      setError(mapTransferError(err));
      setExportState("form");
    }
  }

  async function handleImport() {
    if (!transferCode.trim()) { setError(t("settings.transfer.error.emptyCode")); return; }
    if (!password) { setError(t("settings.transfer.error.emptyPassword")); return; }
    setError(null);
    try {
      const count = await importChatHistory(transferCode.trim(), password, (p) => {
        if (p.stage === "decrypting") setImportState("decrypting");
        else if (p.stage === "restoring") setImportState("restoring");
        else if (p.stage === "done") { setImportState("done"); setResultCount(p.conversationCount); }
      });
      setResultCount(count);
      setImportState("done");
    } catch (err) {
      setError(mapTransferError(err));
      setImportState("form");
    }
  }

  function copyCode() {
    void navigator.clipboard.writeText(resultId).then(() => {
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    });
  }

  const exportBusy = exportState === "encrypting" || exportState === "uploading";
  const importBusy = importState === "downloading" || importState === "decrypting" || importState === "restoring";

  return (
    <SettingsGroup
      eyebrow={t("settings.transfer.group")}
      title={t("settings.transfer.group.title")}
      description={t("settings.transfer.group.description")}
    >
      <SettingsRow
        label={t("settings.transfer.export.label")}
        description={t("settings.transfer.export.description")}
        layout={mode === "export" ? "stacked" : "inline"}
      >
        {mode !== "export" ? (
          <PillButton type="button" tone="accent" appearance="soft" size="sm" onClick={() => { reset(); setMode("export"); }}>
            {t("settings.transfer.export.button")}
          </PillButton>
        ) : exportState === "done" ? (
          <div className={styles.pinInputGroup}>
            <p className={`${styles.pinFeedback} ${styles.pinFeedbackSuccess}`}>
              {t("settings.transfer.export.code", { id: resultId })}
            </p>
            <p className={styles.pinFeedback}>{t("settings.transfer.export.note")}</p>
            <div className={styles.pinButtonRow}>
              <PillButton type="button" tone="accent" appearance="soft" size="sm" onClick={copyCode}>
                {codeCopied ? t("settings.transfer.export.codeCopied") : t("settings.transfer.export.copyCode")}
              </PillButton>
              <PillButton type="button" tone="neutral" appearance="soft" size="sm" onClick={reset}>
                {t("settings.appLock.pinEntry.cancel")}
              </PillButton>
            </div>
          </div>
        ) : (
          <div className={styles.pinInputGroup}>
            <InputField
              type="password"
              autoComplete="new-password"
              placeholder={t("settings.transfer.export.passwordPlaceholder")}
              aria-label={t("settings.transfer.export.passwordPlaceholder")}
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(null); }}
              disabled={exportBusy}
              wrapperClassName={styles.pinInput}
            />
            {error ? <p className={`${styles.pinFeedback} ${styles.pinFeedbackError}`}>{error}</p> : null}
            <div className={styles.pinButtonRow}>
              <PillButton type="button" tone="accent" appearance="soft" size="sm" onClick={() => { void handleExport(); }} disabled={exportBusy}>
                {exportState === "encrypting"
                  ? t("settings.transfer.export.encrypting")
                  : exportState === "uploading"
                    ? t("settings.transfer.export.uploading")
                    : t("settings.transfer.export.submit")}
              </PillButton>
              <PillButton type="button" tone="neutral" appearance="soft" size="sm" onClick={reset} disabled={exportBusy}>
                {t("settings.appLock.pinEntry.cancel")}
              </PillButton>
            </div>
          </div>
        )}
      </SettingsRow>

      <SettingsRow
        label={t("settings.transfer.import.label")}
        description={t("settings.transfer.import.description")}
        layout={mode === "import" ? "stacked" : "inline"}
      >
        {mode !== "import" ? (
          <PillButton type="button" tone="accent" appearance="soft" size="sm" onClick={() => { reset(); setMode("import"); }}>
            {t("settings.transfer.import.button")}
          </PillButton>
        ) : importState === "done" ? (
          <div className={styles.pinInputGroup}>
            <p className={`${styles.pinFeedback} ${styles.pinFeedbackSuccess}`}>
              {t("settings.transfer.import.done", { count: String(resultCount) })}
            </p>
            <PillButton type="button" tone="neutral" appearance="soft" size="sm" onClick={reset}>
              {t("settings.appLock.pinEntry.cancel")}
            </PillButton>
          </div>
        ) : (
          <div className={styles.pinInputGroup}>
            <InputField
              type="text"
              autoComplete="off"
              placeholder={t("settings.transfer.import.codePlaceholder")}
              aria-label={t("settings.transfer.import.codePlaceholder")}
              value={transferCode}
              onChange={(e) => { setTransferCode(e.target.value); setError(null); }}
              disabled={importBusy}
              wrapperClassName={styles.pinInput}
            />
            <InputField
              type="password"
              autoComplete="current-password"
              placeholder={t("settings.transfer.import.passwordPlaceholder")}
              aria-label={t("settings.transfer.import.passwordPlaceholder")}
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(null); }}
              disabled={importBusy}
              wrapperClassName={styles.pinInput}
            />
            {error ? <p className={`${styles.pinFeedback} ${styles.pinFeedbackError}`}>{error}</p> : null}
            <div className={styles.pinButtonRow}>
              <PillButton type="button" tone="accent" appearance="soft" size="sm" onClick={() => { void handleImport(); }} disabled={importBusy}>
                {importState === "downloading"
                  ? t("settings.transfer.import.decrypting")
                  : importState === "decrypting"
                    ? t("settings.transfer.import.decrypting")
                    : importState === "restoring"
                      ? t("settings.transfer.import.restoring")
                      : t("settings.transfer.import.submit")}
              </PillButton>
              <PillButton type="button" tone="neutral" appearance="soft" size="sm" onClick={reset} disabled={importBusy}>
                {t("settings.appLock.pinEntry.cancel")}
              </PillButton>
            </div>
          </div>
        )}
      </SettingsRow>
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
      <TransferSection />
    </div>
  );
}
