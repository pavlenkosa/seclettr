/**
 * TransferSection — chat history export and import group for Security settings.
 *
 * Owns:
 *   - Export flow: password input → encrypt → upload → display code.
 *   - Import flow: code + password input → download → decrypt → restore.
 *   - Progress state machine for both directions; user-facing error mapping.
 *
 * Does not own:
 *   - Crypto and network operations (belong in @/lib/chat-transfer).
 *
 * CSS: shared with siblings via `./SecuritySettingsSection.module.css` —
 *   see BiometricUnlockRow.tsx for the rationale.
 */
import { useState } from "react";
import { useI18n } from "@/i18n";
import { InputField, PillButton } from "@/components/ui";
import { exportChatHistory, importChatHistory } from "@/lib/chat-transfer";
import { ApiError } from "@/lib/api";
import { SettingsGroup, SettingsRow } from "./SettingsSectionPrimitives";
import styles from "./SecuritySettingsSection.module.css";

type TransferMode = "idle" | "export" | "import";
type TransferExportState = "form" | "encrypting" | "uploading" | "done";
type TransferImportState = "form" | "downloading" | "decrypting" | "restoring" | "done";

function ExportTransferView({
  state, busy, password, resultId, codeCopied, error, onPasswordChange, onSubmit, onCancel, onCopyCode,
}: {
  readonly state: TransferExportState;
  readonly busy: boolean;
  readonly password: string;
  readonly resultId: string;
  readonly codeCopied: boolean;
  readonly error: string | null;
  readonly onPasswordChange: (v: string) => void;
  readonly onSubmit: () => void;
  readonly onCancel: () => void;
  readonly onCopyCode: () => void;
}) {
  const { t } = useI18n();
  if (state === "done") {
    return (
      <div className={styles.pinInputGroup}>
        <p className={`${styles.pinFeedback} ${styles.pinFeedbackSuccess}`}>
          {t("settings.transfer.export.code", { id: resultId })}
        </p>
        <p className={styles.pinFeedback}>{t("settings.transfer.export.note")}</p>
        <div className={styles.pinButtonRow}>
          <PillButton type="button" tone="accent" appearance="strong" size="md" fullWidth onClick={onCopyCode}>
            {codeCopied ? t("settings.transfer.export.codeCopied") : t("settings.transfer.export.copyCode")}
          </PillButton>
          <PillButton type="button" tone="neutral" appearance="soft" size="md" fullWidth onClick={onCancel}>
            {t("settings.appLock.pinEntry.cancel")}
          </PillButton>
        </div>
      </div>
    );
  }
  return (
    <div className={styles.pinInputGroup}>
      <InputField
        type="password"
        autoComplete="new-password"
        placeholder={t("settings.transfer.export.passwordPlaceholder")}
        aria-label={t("settings.transfer.export.passwordPlaceholder")}
        value={password}
        onChange={(e) => onPasswordChange(e.target.value)}
        disabled={busy}
        wrapperClassName={styles.pinInput}
      />
      {error ? <p className={`${styles.pinFeedback} ${styles.pinFeedbackError}`}>{error}</p> : null}
      <div className={styles.pinButtonRow}>
        <PillButton type="button" tone="accent" appearance="strong" size="md" fullWidth onClick={onSubmit} disabled={busy}>
          {state === "encrypting"
            ? t("settings.transfer.export.encrypting")
            : state === "uploading"
              ? t("settings.transfer.export.uploading")
              : t("settings.transfer.export.submit")}
        </PillButton>
        <PillButton type="button" tone="neutral" appearance="soft" size="md" fullWidth onClick={onCancel} disabled={busy}>
          {t("settings.appLock.pinEntry.cancel")}
        </PillButton>
      </div>
    </div>
  );
}

function ImportTransferView({
  state, busy, transferCode, password, error, resultCount,
  onTransferCodeChange, onPasswordChange, onSubmit, onCancel,
}: {
  readonly state: TransferImportState;
  readonly busy: boolean;
  readonly transferCode: string;
  readonly password: string;
  readonly error: string | null;
  readonly resultCount: number;
  readonly onTransferCodeChange: (v: string) => void;
  readonly onPasswordChange: (v: string) => void;
  readonly onSubmit: () => void;
  readonly onCancel: () => void;
}) {
  const { t } = useI18n();
  if (state === "done") {
    return (
      <div className={styles.pinInputGroup}>
        <p className={`${styles.pinFeedback} ${styles.pinFeedbackSuccess}`}>
          {t("settings.transfer.import.done", { count: String(resultCount) })}
        </p>
        <PillButton type="button" tone="neutral" appearance="soft" size="md" fullWidth onClick={onCancel}>
          {t("settings.appLock.pinEntry.cancel")}
        </PillButton>
      </div>
    );
  }
  return (
    <div className={styles.pinInputGroup}>
      <InputField
        type="text"
        autoComplete="off"
        placeholder={t("settings.transfer.import.codePlaceholder")}
        aria-label={t("settings.transfer.import.codePlaceholder")}
        value={transferCode}
        onChange={(e) => onTransferCodeChange(e.target.value)}
        disabled={busy}
        wrapperClassName={styles.pinInput}
      />
      <InputField
        type="password"
        autoComplete="current-password"
        placeholder={t("settings.transfer.import.passwordPlaceholder")}
        aria-label={t("settings.transfer.import.passwordPlaceholder")}
        value={password}
        onChange={(e) => onPasswordChange(e.target.value)}
        disabled={busy}
        wrapperClassName={styles.pinInput}
      />
      {error ? <p className={`${styles.pinFeedback} ${styles.pinFeedbackError}`}>{error}</p> : null}
      <div className={styles.pinButtonRow}>
        <PillButton type="button" tone="accent" appearance="strong" size="md" fullWidth onClick={onSubmit} disabled={busy}>
          {state === "downloading"
            ? t("settings.transfer.import.decrypting")
            : state === "decrypting"
              ? t("settings.transfer.import.decrypting")
              : state === "restoring"
                ? t("settings.transfer.import.restoring")
                : t("settings.transfer.import.submit")}
        </PillButton>
        <PillButton type="button" tone="neutral" appearance="soft" size="md" fullWidth onClick={onCancel} disabled={busy}>
          {t("settings.appLock.pinEntry.cancel")}
        </PillButton>
      </div>
    </div>
  );
}

function mapTransferError(t: ReturnType<typeof useI18n>["t"], err: unknown): string {
  if (err instanceof Error) {
    if (err.message === "transfer_wrong_password") return t("settings.transfer.error.wrongPassword");
    if (err.message === "transfer_blob_too_short") return t("settings.transfer.error.wrongPassword");
    if (err.message === "transfer_invalid_package") return t("settings.transfer.error.wrongPassword");
  }
  if (err instanceof ApiError && err.status === 404) return t("settings.transfer.error.notFound");
  return t("settings.transfer.error.generic");
}

export function TransferSection({ flat = false }: { readonly flat?: boolean }) {
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
      setError(mapTransferError(t, err));
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
      setError(mapTransferError(t, err));
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

  const showExportView = mode === "export";

  return (
    <SettingsGroup
      eyebrow={t("settings.transfer.group")}
      title={t("settings.transfer.group.title")}
      description={t("settings.transfer.group.description")}
      flat={flat}
    >
      <SettingsRow
        label={t("settings.transfer.export.label")}
        description={t("settings.transfer.export.description")}
        layout={showExportView ? "stacked" : "inline"}
      >
        {showExportView ? (
          <ExportTransferView
            state={exportState}
            busy={exportBusy}
            password={password}
            resultId={resultId}
            codeCopied={codeCopied}
            error={error}
            onPasswordChange={(v) => { setPassword(v); setError(null); }}
            onSubmit={() => { void handleExport(); }}
            onCancel={reset}
            onCopyCode={copyCode}
          />
        ) : (
          <PillButton type="button" tone="accent" appearance="strong" size="md" fullWidth onClick={() => { reset(); setMode("export"); }}>
            {t("settings.transfer.export.button")}
          </PillButton>
        )}
      </SettingsRow>

      <SettingsRow
        label={t("settings.transfer.import.label")}
        description={t("settings.transfer.import.description")}
        layout={mode === "import" ? "stacked" : "inline"}
      >
        {mode === "import" ? (
          <ImportTransferView
            state={importState}
            busy={importBusy}
            transferCode={transferCode}
            password={password}
            error={error}
            onTransferCodeChange={(v) => { setTransferCode(v); setError(null); }}
            onPasswordChange={(v) => { setPassword(v); setError(null); }}
            onSubmit={() => { void handleImport(); }}
            onCancel={reset}
            resultCount={resultCount}
          />
        ) : (
          <PillButton type="button" tone="accent" appearance="strong" size="md" fullWidth onClick={() => { reset(); setMode("import"); }}>
            {t("settings.transfer.import.button")}
          </PillButton>
        )}
      </SettingsRow>
    </SettingsGroup>
  );
}
